# kb-rag · 企业级 RAG 知识库问答

上传公司 PDF / Word / Markdown / TXT 文档，提问时从资料中混合检索相关切片，让大模型**带引用、不瞎编**地流式回答。

- 对话模型：DeepSeek（OpenAI 兼容协议，可切换）
- Embedding：硅基流动 BGE-m3（1024 维，可切换）
  > 注意：DeepSeek 不提供 embedding 接口，因此 Embedding 必须单独配置。
- 数据库：PostgreSQL 16 + pgvector（HNSW 余弦索引）
- 检索：向量语义 + 全文关键词，RRF 排名融合（Rerank 精排预留接口）
- 交互：手写 SSE 协议（`meta → sources → delta* → done`），逐字输出、可停止，正文 `[n]` 引用可点开查看原文

## ✅ 你需要做的事（首次启动 10 分钟）

1. **准备运行环境**：Node.js ≥ 20.9、pnpm、Docker Desktop。
2. **启动数据库**：项目根目录执行 `docker compose up -d`（镜像 `pgvector/pgvector:pg16`，端口 5432）。
3. **申请两个 API Key**：
   - DeepSeek（对话）：<https://platform.deepseek.com/>，充值 ¥10–20 即可；
   - 硅基流动（Embedding）：<https://cloud.siliconflow.cn/>，创建 API 密钥；BGE-m3 在免费/低价模型范围内。
4. **配置环境变量**：`cp .env.example .env.local`，填入两把 key（默认值已按 bge-m3 配好，一般只改 key）。
5. **初始化数据库表**：`pnpm install` 然后 `pnpm db:init`（幂等，可重复执行；会自动创建「默认知识库」）。
6. **启动**：`pnpm dev`，打开 <http://localhost:3000>（自动跳转 `/chat`）。
7. **验证闭环**：在「知识库文档」上传一份 10 页内的 PDF → 状态变「已就绪」→ 提问，看到逐字回答与引用角标。

> 如改用 OpenAI `text-embedding-3-small`：把 `.env.local` 中 baseURL/key/model 改为 OpenAI，并将 `EMBEDDING_DIMENSIONS` 改为 `1536`，**在尚未导入数据时**重新执行 `pnpm db:init`（维度变更需重建 `chunks` 表）。

## 项目结构

```
src/
├── app/
│   ├── chat/page.tsx            # 对话页：状态编排 + SSE 消费
│   ├── api/
│   │   ├── kb/route.ts          # 知识库列表/创建
│   │   ├── documents/           # 上传/列表/删除 + 切片原文定位（引用溯源）
│   │   ├── conversations/       # 会话列表/详情/删除（历史持久化）
│   │   └── chat/route.ts        # SSE 流式问答（检索→约束生成→落库）
│   └── globals.css
├── components/                  # 侧边栏 / 上传面板 / 对话区 / 消息 / 引用抽屉
├── lib/
│   ├── env.ts                   # 环境变量 zod 校验（fail-fast）
│   ├── types.ts                 # 前后端共享 DTO 与 SSE 事件类型
│   ├── validation/schemas.ts    # 入参 zod 校验
│   ├── db/                      # postgres 客户端 + 仓储函数 + 行类型
│   ├── ai/                      # 模型客户端 / 批量 embedding（重试+维度校验）/ prompt
│   ├── rag/
│   │   ├── parsers.ts           # PDF/DOCX/MD/TXT 解析
│   │   ├── splitters.ts         # 段落聚合+定长+overlap 切分（含单测）
│   │   ├── retrieve.ts          # 混合检索（向量 + FTS）
│   │   ├── fusion.ts            # RRF 倒数排名融合（含单测）
│   │   ├── rerank.ts            # Reranker 接口 + 默认 Noop 实现
│   │   └── ingest.ts            # 离线索引流水线（状态机驱动）
│   └── http/
│       ├── route.ts             # ApiError + handleRoute + zod 入参解析
│       └── sse.ts               # SSE 响应工厂（帧格式/断连中断）
└── scripts/init-db.ts           # 建库建表（维度取自环境变量）
```

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 本地开发 |
| `pnpm build && pnpm start` | 生产构建/启动 |
| `pnpm typecheck` | TypeScript 严格模式检查 |
| `pnpm test` | 运行切分器与 RRF 单元测试 |
| `pnpm db:init` | 初始化/修复数据库结构（幂等） |

## 部署到 Vercel + Neon（免费额度，约 20 分钟）

架构：**Vercel** 托管 Next.js 应用，**Neon** 提供 Serverless PostgreSQL（原生支持 pgvector）。代码已做好适配：`prepare: false` 兼容 Neon 的 PgBouncer 连接池，对话/上传路由已声明 `maxDuration = 60`。

### Step 1 — 推送 GitHub

在 GitHub 新建空仓库后：

```bash
git init && git add . && git commit -m "init: kb-rag"
git remote add origin https://github.com/<你的用户名>/kb-rag.git
git push -u origin main
```

### Step 2 — 创建 Neon 数据库

1. 打开 [neon.tech](https://neon.tech)，用 GitHub 登录，新建项目（Postgres 16+，区域选 **Singapore**）
2. 在连接详情中复制 **Pooled connection** 连接串（主机名含 `-pooler`、带 `sslmode=require`），形如：
   `postgresql://user:password@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

> 连接串含密码，只填入本地文件/Vercel 环境变量，不要发到聊天或提交到仓库。

### Step 3 — 建表（二选一）

- **方式 A（推荐）**：把本地 `.env.local` 的 `DATABASE_URL` 临时换成 Neon pooled 串，执行 `pnpm db:init`，看到 `✅ 完成` 后把连接串改回本地值（避免本地开发误连线上库）。
- **方式 B**：在 Neon 控制台 **SQL Editor** 中粘贴执行 [scripts/init-db.ts](scripts/init-db.ts) 里 `ddl` 常量的全部 SQL。

### Step 4 — 在 Vercel 导入并配置环境变量

1. 打开 [vercel.com](https://vercel.com)，用 GitHub 登录 → **Add New → Project** → Import 该仓库（无需改 Build 配置，框架自动识别）
2. **Settings → Environment Variables** 逐条添加（与 `.env.example` 同名）：

| 变量 | 值 |
|---|---|
| `DATABASE_URL` | Step 2 的 Neon **pooled** 连接串 |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 与本地相同 |
| `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` | 与本地相同 |
| `EMBEDDING_DIMENSIONS` | `1024`（**必须与建表时一致**，改维度需 DROP 并重建 chunks 表） |
| `MAX_FILE_SIZE_MB` | `4`（Vercel 请求体硬上限 4.5MB） |

3. **Settings → Functions → Function Region** 选 **Singapore (sin1)**，缩短到 Neon 与国内大模型 API 的延迟
4. Deploy，等待构建完成

### Step 5 — 验收

打开分配的 `https://<项目>.vercel.app`：新建知识库 → 上传一份小 PDF（≤4MB）→ 状态变为「已就绪」→ 提问能看到流式回答与引用角标，即部署成功。

### 平台限制与排错

| 现象 | 原因 / 处理 |
|---|---|
| 列表/提问 500，日志含 `relation "chunks" does not exist` | 跳过了 Step 3，补执行建表 |
| 日志含维度不匹配（`expected 1024 dimensions`） | `EMBEDDING_DIMENSIONS` 与建表不一致；在 Neon 执行 `DROP TABLE chunks;` 后重新建表+重新索引 |
| 上传报 413/请求失败 | 超过 Vercel 4.5MB 请求体上限；压缩文档或拆分上传 |
| 大文档上传超时（60s） | Hobby 函数上限；作品集请用 20 页内文档，根治方案见迭代路线第 3 条（BullMQ） |
| 国内访问 `*.vercel.app` 不稳定 | Vercel 免费域名在国内被干扰，演示/作品集够用；正式给国内用户使用请换腾讯云/阿里云常驻部署 |

## 架构与数据流

```
上传 → 解析(PDF/DOCX/MD/TXT) → 切分(500字/80 overlap) → BGE-m3 向量化
     → PostgreSQL pgvector（HNSW 余弦索引），状态 pending→processing→done/failed

提问 → 问题向量化 → ┬ 向量路（<=> 余弦距离）
                    └ 关键词路（PG FTS/ts_rank）
                  → RRF 融合 → (Rerank 预留) → top6 切片
                  → 强约束 system prompt（只依据资料/必标引用/不足拒答）
                  → DeepSeek 流式生成 → SSE：meta/sources/delta/done
```

## 后续迭代路线（对应转型方案 W6–W7）

1. **Rerank 精排**：实现 `Reranker` 接口（硅基流动 `BAAI/bge-reranker-v2-m3` 或 Cohere），在 [rerank.ts](src/lib/rag/rerank.ts) 替换 `NoopReranker`，上层零改动。
2. **中文关键词检索**：生产建议为 PG 安装 zhparser/jieba 分词扩展，替换 `'simple'` 配置。
3. **异步索引**：将 [ingest.ts](src/lib/rag/ingest.ts) 整体移入 BullMQ worker（上传请求只入队），适配 Vercel 等 Serverless 平台的大文件超时。
4. **可观测**：接入 Langfuse，trace 记录 query→召回切片及分数→prompt→token 用量。
5. **评测**：准备 20 条标准问答，统计 Hit@k/MRR 与拒答正确率，用数据驱动 chunkSize/overlap/topK 调参。
6. **部署**：已支持 Vercel + Neon Serverless Postgres 一键部署，见上文「部署到 Vercel + Neon」；BullMQ worker 等常驻进程需 Railway/Render/云服务器。

## 安全注意

- `.env.local` 已在 `.gitignore`；仓库公开前检查 git 历史无密钥。
- 所有 key 只在服务端读取，不要加 `NEXT_PUBLIC_` 前缀。
- 演示文档请使用公开或脱敏资料。
