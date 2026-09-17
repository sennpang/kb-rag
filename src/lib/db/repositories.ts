import { sql } from './client';
import type {
  ChunkRecord,
  Conversation,
  DocumentRecord,
  DocumentStatus,
  KnowledgeBase,
  MessageRecord,
  MessageRole,
} from './types';

/* ──────────────────────── 知识库 ──────────────────────── */

interface KnowledgeBaseRow {
  id: string;
  name: string;
  created_at: Date;
}

const mapKnowledgeBase = (r: KnowledgeBaseRow): KnowledgeBase => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at.toISOString(),
});

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const rows = await sql<KnowledgeBaseRow[]>`
    SELECT id, name, created_at FROM knowledge_bases ORDER BY created_at ASC
  `;
  return rows.map(mapKnowledgeBase);
}

export async function createKnowledgeBase(name: string): Promise<KnowledgeBase> {
  const rows = await sql<KnowledgeBaseRow[]>`
    INSERT INTO knowledge_bases (name) VALUES (${name})
    RETURNING id, name, created_at
  `;
  return mapKnowledgeBase(rows[0]!);
}

export async function knowledgeBaseExists(id: string): Promise<boolean> {
  const rows = await sql<Array<{ exists: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM knowledge_bases WHERE id = ${id})
  `;
  return rows[0]?.exists ?? false;
}

/* ──────────────────────── 文档 ──────────────────────── */

interface DocumentRow {
  id: string;
  kb_id: string;
  filename: string;
  status: DocumentStatus;
  mime_type: string | null;
  error_msg: string | null;
  chunk_count: number;
  created_at: Date;
}

const mapDocument = (r: DocumentRow): DocumentRecord => ({
  id: r.id,
  kbId: r.kb_id,
  filename: r.filename,
  status: r.status,
  mimeType: r.mime_type,
  errorMsg: r.error_msg,
  chunkCount: r.chunk_count,
  createdAt: r.created_at.toISOString(),
});

export async function insertDocument(input: {
  kbId: string;
  filename: string;
  mimeType: string;
}): Promise<DocumentRecord> {
  const rows = await sql<DocumentRow[]>`
    INSERT INTO documents (kb_id, filename, mime_type)
    VALUES (${input.kbId}, ${input.filename}, ${input.mimeType})
    RETURNING id, kb_id, filename, status, mime_type, error_msg, chunk_count, created_at
  `;
  return mapDocument(rows[0]!);
}

export async function updateDocumentStatus(
  id: string,
  status: DocumentStatus,
  extra: { chunkCount?: number; errorMsg?: string } = {},
): Promise<void> {
  await sql`
    UPDATE documents SET
      status = ${status},
      chunk_count = COALESCE(${extra.chunkCount ?? null}, chunk_count),
      error_msg = ${extra.errorMsg ?? null}
    WHERE id = ${id}
  `;
}

export async function listDocuments(kbId: string): Promise<DocumentRecord[]> {
  const rows = await sql<DocumentRow[]>`
    SELECT id, kb_id, filename, status, mime_type, error_msg, chunk_count, created_at
    FROM documents WHERE kb_id = ${kbId} ORDER BY created_at DESC
  `;
  return rows.map(mapDocument);
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  const rows = await sql<DocumentRow[]>`
    SELECT id, kb_id, filename, status, mime_type, error_msg, chunk_count, created_at
    FROM documents WHERE id = ${id}
  `;
  return rows[0] ? mapDocument(rows[0]) : null;
}

export async function deleteDocument(id: string): Promise<void> {
  // chunks 通过 ON DELETE CASCADE 自动清理
  await sql`DELETE FROM documents WHERE id = ${id}`;
}

/* ──────────────────────── Chunk ──────────────────────── */

interface ChunkRow {
  id: string;
  doc_id: string;
  kb_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown> | null;
}

const mapChunk = (r: ChunkRow): ChunkRecord => ({
  id: r.id,
  docId: r.doc_id,
  kbId: r.kb_id,
  chunkIndex: r.chunk_index,
  content: r.content,
  metadata: r.metadata ?? {},
});

/** 单批写入条数：控制单条语句的参数体积（1024 维向量文本较大） */
const INSERT_BATCH_SIZE = 100;

/**
 * 批量写入切片与向量，分批多值 INSERT、单事务保证原子性。
 * embedding 以 pgvector 文本格式传入并强转（::vector）。
 */
export async function insertChunks(
  params: Array<{ docId: string; kbId: string; chunkIndex: number; content: string; embedding: number[] }>,
): Promise<void> {
  if (params.length === 0) return;

  const COLUMNS = 5;
  await sql.begin(async (tx) => {
    for (let start = 0; start < params.length; start += INSERT_BATCH_SIZE) {
      const batch = params.slice(start, start + INSERT_BATCH_SIZE);
      const placeholders = batch
        .map((_, i) => {
          const base = i * COLUMNS + 1;
          return `($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::vector)`;
        })
        .join(', ');

      await tx.unsafe(
        `INSERT INTO chunks (doc_id, kb_id, chunk_index, content, embedding)
         VALUES ${placeholders}`,
        batch.flatMap((p) => [p.docId, p.kbId, p.chunkIndex, p.content, JSON.stringify(p.embedding)]),
      );
    }
  });
}

export async function getChunkWithContext(
  docId: string,
  chunkIndex: number,
): Promise<{ current: ChunkRecord; previous: ChunkRecord | null; next: ChunkRecord | null } | null> {
  const rows = await sql<ChunkRow[]>`
    SELECT id, doc_id, kb_id, chunk_index, content, metadata
    FROM chunks
    WHERE doc_id = ${docId} AND chunk_index BETWEEN ${chunkIndex - 1} AND ${chunkIndex + 1}
    ORDER BY chunk_index ASC
  `;
  const findByIndex = (index: number) => rows.find((r) => r.chunk_index === index);
  const current = findByIndex(chunkIndex);
  if (!current) return null;
  const previous = findByIndex(chunkIndex - 1);
  const next = findByIndex(chunkIndex + 1);
  return {
    previous: previous ? mapChunk(previous) : null,
    current: mapChunk(current),
    next: next ? mapChunk(next) : null,
  };
}

/* ──────────────────────── 会话 / 消息 ──────────────────────── */

interface ConversationRow {
  id: string;
  kb_id: string;
  title: string;
  created_at: Date;
}

const mapConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  kbId: r.kb_id,
  title: r.title,
  createdAt: r.created_at.toISOString(),
});

export async function createConversation(kbId: string, title: string): Promise<Conversation> {
  const rows = await sql<ConversationRow[]>`
    INSERT INTO conversations (kb_id, title) VALUES (${kbId}, ${title})
    RETURNING id, kb_id, title, created_at
  `;
  return mapConversation(rows[0]!);
}

export async function listConversations(kbId: string): Promise<Conversation[]> {
  const rows = await sql<ConversationRow[]>`
    SELECT id, kb_id, title, created_at FROM conversations
    WHERE kb_id = ${kbId} ORDER BY created_at DESC
  `;
  return rows.map(mapConversation);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const rows = await sql<ConversationRow[]>`
    SELECT id, kb_id, title, created_at FROM conversations WHERE id = ${id}
  `;
  return rows[0] ? mapConversation(rows[0]) : null;
}

export async function deleteConversation(id: string): Promise<void> {
  await sql`DELETE FROM conversations WHERE id = ${id}`;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  sources: unknown;
  token_input: number | null;
  token_output: number | null;
  created_at: Date;
}

export async function insertMessage(input: {
  conversationId: string;
  role: MessageRole;
  content: string;
  sources?: unknown;
  tokenInput?: number;
  tokenOutput?: number;
}): Promise<void> {
  await sql`
    INSERT INTO messages (conversation_id, role, content, sources, token_input, token_output)
    VALUES (
      ${input.conversationId}, ${input.role}, ${input.content},
      ${JSON.stringify(input.sources ?? [])}::jsonb,
      ${input.tokenInput ?? null}, ${input.tokenOutput ?? null}
    )
  `;
}

export async function listMessages(conversationId: string): Promise<MessageRecord[]> {
  const rows = await sql<MessageRow[]>`
    SELECT id, conversation_id, role, content, sources, token_input, token_output, created_at
    FROM messages WHERE conversation_id = ${conversationId} ORDER BY created_at ASC, id ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    sources: r.sources,
    createdAt: r.created_at.toISOString(),
  }));
}
