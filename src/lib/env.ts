import { z } from 'zod';

/**
 * 服务端环境变量。首次访问时才解析校验（懒加载）：
 *  - 运行期缺配置立刻 fail-fast，给出明确的字段级错误；
 *  - 构建期（next build 收集路由元数据）仅 import 不读值，不要求 .env 存在。
 * 仅允许在服务端引用，切勿加 NEXT_PUBLIC_ 前缀。
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),

  LLM_BASE_URL: z.string().url().default('https://api.deepseek.com/v1'),
  LLM_API_KEY: z.string().min(1, '缺少 LLM_API_KEY'),
  LLM_MODEL: z.string().default('deepseek-chat'),

  EMBEDDING_BASE_URL: z.string().url(),
  EMBEDDING_API_KEY: z.string().min(1, '缺少 EMBEDDING_API_KEY'),
  EMBEDDING_MODEL: z.string().default('BAAI/bge-m3'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),

  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().max(100).default(20),

  SMTP_HOST: z.string().default('smtp.qq.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().min(1, '缺少 SMTP_USER（发件邮箱）'),
  SMTP_PASS: z.string().min(1, '缺少 SMTP_PASS（邮箱 SMTP 授权码，非登录密码）'),
  EMAIL_FROM: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let parsed: Env | null = null;

function load(): Env {
  if (parsed) return parsed;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`环境变量校验失败，请检查 .env.local：\n${issues}`);
  }
  parsed = result.data;
  return parsed;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, key: keyof Env) {
    return load()[key];
  },
});
