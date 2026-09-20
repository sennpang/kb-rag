import { sql } from './client';
import type {
  ChunkRecord,
  Conversation,
  DocumentRecord,
  DocumentStatus,
  KnowledgeBase,
  MessageRecord,
  MessageRole,
  UserRecord,
  VerificationCode,
} from './types';

/* ──────────────────────── 用户 ──────────────────────── */

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  created_at: Date;
}

const mapUser = (r: UserRow): UserRecord => ({
  id: r.id,
  email: r.email,
  name: r.name,
  passwordHash: r.password_hash,
  createdAt: r.created_at.toISOString(),
});

export async function insertUser(input: {
  email: string;
  name: string | null;
  passwordHash: string;
}): Promise<UserRecord> {
  const rows = await sql<UserRow[]>`
    INSERT INTO users (email, name, password_hash)
    VALUES (${input.email}, ${input.name}, ${input.passwordHash})
    RETURNING id, email, name, password_hash, created_at
  `;
  return mapUser(rows[0]!);
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, email, name, password_hash, created_at FROM users WHERE email = ${email}
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

/** 首个用户注册时认领升级前遗留的无主知识库（文档/会话通过 kb 归属随之隔离）。 */
export async function claimUnownedKnowledgeBases(ownerId: string): Promise<number> {
  const rows = await sql<Array<{ n: number }>>`
    WITH updated AS (
      UPDATE knowledge_bases SET owner_id = ${ownerId} WHERE owner_id IS NULL RETURNING 1
    )
    SELECT count(*)::int AS n FROM updated
  `;
  return rows[0]?.n ?? 0;
}

/* ──────────────────────── 知识库 ──────────────────────── */

interface KnowledgeBaseRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: Date;
}

const mapKnowledgeBase = (r: KnowledgeBaseRow): KnowledgeBase => ({
  id: r.id,
  name: r.name,
  ownerId: r.owner_id,
  createdAt: r.created_at.toISOString(),
});

export async function listKnowledgeBases(ownerId: string): Promise<KnowledgeBase[]> {
  const rows = await sql<KnowledgeBaseRow[]>`
    SELECT id, name, owner_id, created_at FROM knowledge_bases
    WHERE owner_id = ${ownerId} ORDER BY created_at ASC
  `;
  return rows.map(mapKnowledgeBase);
}

export async function createKnowledgeBase(name: string, ownerId: string): Promise<KnowledgeBase> {
  const rows = await sql<KnowledgeBaseRow[]>`
    INSERT INTO knowledge_bases (name, owner_id) VALUES (${name}, ${ownerId})
    RETURNING id, name, owner_id, created_at
  `;
  return mapKnowledgeBase(rows[0]!);
}

/** 知识库是否存在且归属当前用户（所有涉及 kbId 的接口入口校验）。 */
export async function knowledgeBaseExists(id: string, ownerId: string): Promise<boolean> {
  const rows = await sql<Array<{ exists: boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM knowledge_bases WHERE id = ${id} AND owner_id = ${ownerId}
    )
  `;
  return rows[0]?.exists ?? false;
}

/** 用户拥有的知识库总数，用于单用户建库上限。 */
export async function countKnowledgeBasesByOwner(ownerId: string): Promise<number> {
  const rows = await sql<Array<{ count: string }>>`
    SELECT count(*)::int AS count FROM knowledge_bases WHERE owner_id = ${ownerId}
  `;
  return Number(rows[0]?.count ?? 0);
}

/** 同一知识库下是否已存在相同内容（按 SHA-256 指纹），唯一索引是并发兜底。 */
export async function documentExists(kbId: string, contentHash: string): Promise<boolean> {
  const rows = await sql<Array<{ exists: boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM documents WHERE kb_id = ${kbId} AND content_hash = ${contentHash}
    )
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
  content_hash: string | null;
  created_at: Date;
}

const DOCUMENT_COLUMNS =
  'id, kb_id, filename, status, mime_type, error_msg, chunk_count, content_hash, created_at';

const mapDocument = (r: DocumentRow): DocumentRecord => ({
  id: r.id,
  kbId: r.kb_id,
  filename: r.filename,
  status: r.status,
  mimeType: r.mime_type,
  errorMsg: r.error_msg,
  chunkCount: r.chunk_count,
  contentHash: r.content_hash,
  createdAt: r.created_at.toISOString(),
});

export async function insertDocument(input: {
  kbId: string;
  filename: string;
  mimeType: string;
  contentHash: string;
}): Promise<DocumentRecord> {
  const rows = await sql<DocumentRow[]>`
    INSERT INTO documents (kb_id, filename, mime_type, content_hash)
    VALUES (${input.kbId}, ${input.filename}, ${input.mimeType}, ${input.contentHash})
    RETURNING ${sql.unsafe(DOCUMENT_COLUMNS)}
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
    SELECT ${sql.unsafe(DOCUMENT_COLUMNS)}
    FROM documents WHERE kb_id = ${kbId} ORDER BY created_at DESC
  `;
  return rows.map(mapDocument);
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  const rows = await sql<DocumentRow[]>`
    SELECT ${sql.unsafe(DOCUMENT_COLUMNS)} FROM documents WHERE id = ${id}
  `;
  return rows[0] ? mapDocument(rows[0]) : null;
}

export async function deleteDocument(id: string): Promise<void> {
  // chunks 通过 ON DELETE CASCADE 自动清理
  await sql`DELETE FROM documents WHERE id = ${id}`;
}

/** 知识库内文档总数（含处理失败），用于单库容量上限。 */
export async function countDocumentsInKb(kbId: string): Promise<number> {
  const rows = await sql<Array<{ count: string }>>`
    SELECT count(*)::int AS count FROM documents WHERE kb_id = ${kbId}
  `;
  return Number(rows[0]?.count ?? 0);
}

/**
 * 用户在时间窗口内跨全部知识库的上传量，用于防刷上传、控制向量化成本。
 * 失败文档也计数（请求与解析资源已消耗），用户可自行删除。
 */
export async function countRecentDocumentsByOwner(
  ownerId: string,
  withinSeconds: number,
): Promise<number> {
  const rows = await sql<Array<{ count: string }>>`
    SELECT count(d.*)::int AS count
    FROM documents d
    JOIN knowledge_bases kb ON kb.id = d.kb_id
    WHERE kb.owner_id = ${ownerId}
      AND d.created_at > now() - make_interval(secs => ${withinSeconds})
  `;
  return Number(rows[0]?.count ?? 0);
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

/**
 * 统计用户在时间窗口内发起的问答次数（role='user' 消息，每次问答一条）。
 * 用户消息在请求开始即落库，因此高频脚本除首个请求外都会被计入，用于 chat 接口限流。
 */
export async function countRecentChatsByOwner(
  ownerId: string,
  withinSeconds: number,
): Promise<number> {
  const rows = await sql<Array<{ count: string }>>`
    SELECT count(m.*)::int AS count
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    JOIN knowledge_bases kb ON kb.id = c.kb_id
    WHERE kb.owner_id = ${ownerId}
      AND m.role = 'user'
      AND m.created_at > now() - make_interval(secs => ${withinSeconds})
  `;
  return Number(rows[0]?.count ?? 0);
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

/* ──────────────────────── 邮箱验证码 ──────────────────────── */

interface VerificationCodeRow {
  id: string;
  email: string;
  purpose: string;
  code_hash: string;
  request_ip_hash: string | null;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

const CODE_COLUMNS = `id, email, purpose, code_hash, request_ip_hash, attempts,
  expires_at, consumed_at, created_at`;

const mapVerificationCode = (r: VerificationCodeRow): VerificationCode => ({
  id: r.id,
  email: r.email,
  purpose: r.purpose,
  codeHash: r.code_hash,
  ipHash: r.request_ip_hash,
  attempts: r.attempts,
  expiresAt: r.expires_at.toISOString(),
  consumedAt: r.consumed_at?.toISOString() ?? null,
  createdAt: r.created_at.toISOString(),
});

export async function insertVerificationCode(input: {
  email: string;
  purpose: string;
  codeHash: string;
  ipHash: string | null;
  ttlSeconds: number;
}): Promise<VerificationCode> {
  const rows = await sql<VerificationCodeRow[]>`
    INSERT INTO email_verification_codes
      (email, purpose, code_hash, request_ip_hash, expires_at)
    VALUES (
      ${input.email}, ${input.purpose}, ${input.codeHash}, ${input.ipHash},
      now() + make_interval(secs => ${input.ttlSeconds})
    )
    RETURNING ${sql.unsafe(CODE_COLUMNS)}
  `;
  return mapVerificationCode(rows[0]!);
}

/** 该邮箱+用途的最新一条验证码（含过期/已消费状态），用于限频与注册校验。 */
export async function getLatestVerificationCode(
  email: string,
  purpose: string,
): Promise<VerificationCode | null> {
  const rows = await sql<VerificationCodeRow[]>`
    SELECT ${sql.unsafe(CODE_COLUMNS)}
    FROM email_verification_codes
    WHERE email = ${email} AND purpose = ${purpose}
    ORDER BY created_at DESC LIMIT 1
  `;
  return rows[0] ? mapVerificationCode(rows[0]) : null;
}

/**
 * 统计时间窗口内的发码数量，用于接口层频控。
 * 邮箱与 IP 两个维度至少给一个；两者同时给时取并集（OR）。
 */
export async function countRecentVerificationCodes(filter: {
  email?: string;
  ipHash?: string;
  purpose: string;
  withinSeconds: number;
}): Promise<number> {
  const conditions = [
    sql`purpose = ${filter.purpose}`,
    sql`created_at > now() - make_interval(secs => ${filter.withinSeconds})`,
  ];
  if (filter.email && filter.ipHash) {
    conditions.push(sql`(email = ${filter.email} OR request_ip_hash = ${filter.ipHash})`);
  } else if (filter.email) {
    conditions.push(sql`email = ${filter.email}`);
  } else if (filter.ipHash) {
    conditions.push(sql`request_ip_hash = ${filter.ipHash}`);
  }
  const rows = await sql<{ count: string }[]>`
    SELECT count(*)::int AS count FROM email_verification_codes
    WHERE ${conditions.reduce((acc, c) => sql`${acc} AND ${c}`)}
  `;
  return Number(rows[0]?.count ?? 0);
}

/** 验证码校验失败时递增尝试计数，返回递增后的最新记录（超过上限由调用方作废）。 */
export async function incrementCodeAttempts(id: string): Promise<VerificationCode> {
  const rows = await sql<VerificationCodeRow[]>`
    UPDATE email_verification_codes SET attempts = attempts + 1
    WHERE id = ${id}
    RETURNING ${sql.unsafe(CODE_COLUMNS)}
  `;
  return mapVerificationCode(rows[0]!);
}

export async function consumeVerificationCode(id: string): Promise<void> {
  await sql`
    UPDATE email_verification_codes SET consumed_at = now()
    WHERE id = ${id} AND consumed_at IS NULL
  `;
}
