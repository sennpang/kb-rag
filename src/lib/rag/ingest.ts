import { embedTexts } from '@/lib/ai/embeddings';
import { buildSampleFromChunks, placeDocument } from '@/lib/ai/classify';
import { insertChunks, updateDocumentStatus } from '@/lib/db/repositories';
import { isDev } from '@/lib/env';
import { parseFileToText } from './parsers';
import { splitText } from './splitters';

/** 单文档切片上限：防超大文件一次向量化烧大量 embedding 费用（1000 段 ≈ 50 万字资料）。 */
const MAX_CHUNKS_PER_DOC = 1000;

/**
 * 离线索引流水线（上传时执行一次）：
 * 解析 → 切分 → 批量向量化 → 写入 pgvector，并驱动文档状态机。
 *
 * 说明：MVP 在上传请求内同步执行（作品集规模 20 页内约 10–30 秒）。
 * W7 工程化时把本函数整体挪进 BullMQ worker 即可，签名无需变化。
 */
export async function ingestDocument(params: {
  docId: string;
  kbId: string;
  file: File;
}): Promise<{ chunkCount: number }> {
  const { docId, kbId, file } = params;
  await updateDocumentStatus(docId, 'processing');

  try {
    const rawText = await parseFileToText(file);
    if (!rawText) {
      throw new Error('未能从文档中抽取到文本（扫描件/图片型 PDF 暂不支持）');
    }

    const pieces = splitText(rawText);
    if (pieces.length === 0) {
      throw new Error('切分结果为空');
    }
    // dev 模式不限制切片数（文件大小不限后大文件必然超出此上限）
    if (!isDev && pieces.length > MAX_CHUNKS_PER_DOC) {
      throw new Error(
        `文档切片数 ${pieces.length} 超过单文档上限 ${MAX_CHUNKS_PER_DOC}（约 50 万字），请拆分后分批上传`,
      );
    }

    const vectors = await embedTexts(pieces);
    await insertChunks(
      pieces.map((content, i) => ({
        docId,
        kbId,
        chunkIndex: i,
        content,
        embedding: vectors[i]!,
      })),
    );

    // 文档先落 done：即使随后的分类阶段失败/超时，文档也已可检索，用户可手动点「AI 整理」补归类
    await updateDocumentStatus(docId, 'done', { chunkCount: pieces.length });

    try {
      const sample = buildSampleFromChunks(pieces);
      await placeDocument({ kbId, docId, sample });
    } catch (error) {
      // 分类是增强能力：失败仅记录，文档保持未分类，不影响上传结果
      console.error('[ingest] 自动分类失败：', error);
    }

    return { chunkCount: pieces.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateDocumentStatus(docId, 'failed', { errorMsg: message });
    throw error;
  }
}
