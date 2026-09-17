import { sql } from '@/lib/db/client';
import { embedQuery } from '@/lib/ai/embeddings';
import { reciprocalRankFusion } from './fusion';
import { NoopReranker, type Reranker } from './rerank';
import { DEFAULT_RETRIEVAL_OPTIONS, type RetrievedChunk, type RetrievalOptions } from './types';

interface SearchRow {
  id: string;
  doc_id: string;
  filename: string;
  chunk_index: number;
  content: string;
  score: number | string | null;
}

/**
 * 混合检索：
 * A. 向量语义检索（pgvector HNSW，余弦距离 <=>）
 * B. 关键词全文检索（PG FTS；中文生产环境建议换 zhparser/jieba）
 * C. RRF 按排名融合两路
 * D. （可选）Rerank 精排
 */
export async function hybridRetrieve(
  kbId: string,
  question: string,
  options: Partial<RetrievalOptions> = {},
  reranker: Reranker = new NoopReranker(),
): Promise<RetrievedChunk[]> {
  const opts = { ...DEFAULT_RETRIEVAL_OPTIONS, ...options };
  const limit = opts.topK * opts.candidateMultiplier;
  const queryVector = await embedQuery(question);
  const vectorLiteral = JSON.stringify(queryVector);

  const [semanticRows, keywordRows] = await Promise.all([
    sql<SearchRow[]>`
      SELECT c.id, c.doc_id, d.filename, c.chunk_index, c.content,
             1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
      FROM chunks c
      JOIN documents d ON d.id = c.doc_id
      WHERE c.kb_id = ${kbId}
      ORDER BY c.embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `,
    sql<SearchRow[]>`
      SELECT c.id, c.doc_id, d.filename, c.chunk_index, c.content,
             ts_rank(to_tsvector('simple', c.content), plainto_tsquery('simple', ${question})) AS score
      FROM chunks c
      JOIN documents d ON d.id = c.doc_id
      WHERE c.kb_id = ${kbId}
        AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', ${question})
      ORDER BY score DESC
      LIMIT ${limit}
    `,
  ]);

  const toItem = (r: SearchRow): RetrievedChunk => ({
    id: r.id,
    docId: r.doc_id,
    docName: r.filename,
    chunkIndex: r.chunk_index,
    content: r.content,
    score: Number(r.score ?? 0),
  });

  const fused = reciprocalRankFusion(
    [
      { items: semanticRows.map(toItem), weight: 1 },
      { items: keywordRows.map(toItem), weight: 1 },
    ],
    60,
  );

  // 极端情况下关键词路为空、向量路为空，fused 为空数组，上层据此走"资料不足"分支
  const candidates = fused.map((f) => ({ ...f.item, score: f.score }));
  return reranker.rerank(question, candidates, opts.topK);
}
