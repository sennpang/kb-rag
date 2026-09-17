/**
 * 一键建库建表（幂等，可重复执行）：
 *   pnpm db:init
 *
 * 向量维度来自 EMBEDDING_DIMENSIONS（bge-m3=1024，text-embedding-3-small=1536）。
 * 脚本独立于 Next 运行（tsx），因此直接用 postgres 客户端，不走 @/ 别名。
 */
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
const dimensions = Number(process.env.EMBEDDING_DIMENSIONS ?? 1024);

if (!databaseUrl) {
  throw new Error('缺少 DATABASE_URL，请确认已复制 .env.example 为 .env.local');
}
if (!Number.isInteger(dimensions) || dimensions <= 0) {
  throw new Error(`EMBEDDING_DIMENSIONS 非法：${process.env.EMBEDDING_DIMENSIONS}`);
}

const sql = postgres(databaseUrl, { max: 1 });

const ddl = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id       UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending / processing / done / failed
  mime_type   TEXT,
  error_msg   TEXT,
  chunk_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  kb_id       UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content     TEXT NOT NULL,
  embedding   vector(${dimensions}),
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_kb_doc_idx ON chunks (kb_id, doc_id);
CREATE INDEX IF NOT EXISTS chunks_content_fts_idx
  ON chunks USING gin (to_tsvector('simple', content));

CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id       UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '新会话',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content          TEXT NOT NULL,
  sources          JSONB NOT NULL DEFAULT '[]',
  token_input      INT DEFAULT 0,
  token_output     INT DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);

-- 首次初始化时建一个默认知识库，已存在同名库则不重复创建
INSERT INTO knowledge_bases (name)
SELECT '默认知识库'
WHERE NOT EXISTS (SELECT 1 FROM knowledge_bases WHERE name = '默认知识库');
`;

async function main() {
  console.log(`→ 连接数据库并初始化（向量维度 ${dimensions}）…`);
  await sql.unsafe(ddl);
  const ext = await sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
  console.log(`✅ 完成。pgvector 版本：${ext[0]?.extversion ?? '未知'}`);
  await sql.end();
}

main().catch((err) => {
  console.error('❌ 初始化失败：', err);
  process.exit(1);
});
