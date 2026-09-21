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

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 用户体系上线后为存量表补归属列（历史数据为 NULL，首个用户注册时自动认领）
ALTER TABLE knowledge_bases
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 内容指纹：同知识库下内容相同即重复（文件名不再作为去重依据）
-- 历史文档无法回溯原始文件 hash，置 NULL（PG 唯一索引中多个 NULL 互不冲突）

CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id         UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending / processing / done / failed
  mime_type     TEXT,
  error_msg     TEXT,
  chunk_count   INT NOT NULL DEFAULT 0,
  content_hash  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
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

-- 去重策略从「文件名」改为「内容指纹」：替换唯一索引
-- ALTER 给已存在的旧表补列（新库在 CREATE TABLE 中已含该列，幂等无副作用）
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_hash TEXT;
DROP INDEX IF EXISTS documents_kb_filename_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS documents_kb_content_uidx
  ON documents (kb_id, content_hash);

-- 文件夹（知识库内可多级）：删除知识库级联清理；删除父文件夹级联删除子树
CREATE TABLE IF NOT EXISTS folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id      UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES folders(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 同库同父下文件夹名唯一（COALESCE 把 NULL 父级折成固定 UUID，绕开唯一索引中 NULL 互不相等）
CREATE UNIQUE INDEX IF NOT EXISTS folders_kb_parent_name_uidx
  ON folders (kb_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'), name);

-- 文档归属文件夹；删文件夹时文档不删除，folder_id 置空（变「未分类」）
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

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

-- 邮箱验证码（注册等场景）：码以哈希存储，10 分钟有效；IP 只存哈希用于限频
CREATE TABLE IF NOT EXISTS email_verification_codes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL,
  purpose          TEXT NOT NULL DEFAULT 'register',
  code_hash        TEXT NOT NULL,
  request_ip_hash  TEXT,
  attempts         INT NOT NULL DEFAULT 0,
  expires_at       TIMESTAMPTZ NOT NULL,
  consumed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evc_email_purpose_created_idx
  ON email_verification_codes (email, purpose, created_at DESC);

-- 老库平滑升级（新库列已在上面定义，IF NOT EXISTS 保证幂等）
ALTER TABLE email_verification_codes ADD COLUMN IF NOT EXISTS request_ip_hash TEXT;
ALTER TABLE email_verification_codes ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;

-- 依赖新列的索引必须放在 ALTER 之后，否则老库建索引时列尚不存在
CREATE INDEX IF NOT EXISTS evc_ip_created_idx
  ON email_verification_codes (request_ip_hash, created_at DESC);

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
