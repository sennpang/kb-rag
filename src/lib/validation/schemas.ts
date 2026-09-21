import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const createKbSchema = z.object({
  name: z.string().trim().min(1, '知识库名称不能为空').max(100),
});

export const chatMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, '消息内容不能为空').max(20_000),
});

export const MAX_CHAT_MESSAGES = 40; // 单次请求携带的历史消息条数上限
export const MAX_CHAT_TOTAL_CHARS = 60_000; // 历史消息总字符上限（约 9 万 token 封顶）

// 基础结构校验（不含条数/总字符限制），供普通与豁免两个版本复用
const chatRequestBase = z.object({
  kbId: uuidSchema,
  conversationId: uuidSchema.optional().nullable(),
  messages: z.array(chatMessageSchema).min(1, '至少包含一条消息'),
});

/** 普通请求：限制历史条数与总字符，防止上下文膨胀烧 token。 */
export const chatRequestSchema = chatRequestBase
  .refine((v) => v.messages.length <= MAX_CHAT_MESSAGES, {
    message: `对话历史不能超过 ${MAX_CHAT_MESSAGES} 条，请开新会话`,
    path: ['messages'],
  })
  .refine((v) => v.messages.reduce((sum, m) => sum + m.content.length, 0) <= MAX_CHAT_TOTAL_CHARS, {
    message: `消息总长度不能超过 ${MAX_CHAT_TOTAL_CHARS} 字符，请开新会话或精简历史`,
    path: ['messages'],
  });

/** 豁免请求（dev / 白名单账号）：只做结构校验，不限历史条数与总字符。 */
export const chatRequestExemptSchema = chatRequestBase;

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const kbParamSchema = z.object({ kbId: uuidSchema });
export const idParamSchema = z.object({ id: uuidSchema });
export const chunkParamSchema = z.object({ id: uuidSchema, index: z.coerce.number().int().min(0) });

/* ──────────────────────── 文件夹 ──────────────────────── */

const folderNameField = z
  .string()
  .trim()
  .min(1, '文件夹名称不能为空')
  .max(50, '文件夹名称不能超过 50 字');

export const createFolderSchema = z.object({
  kbId: uuidSchema,
  name: folderNameField,
  parentId: uuidSchema.optional().nullable(),
});

export const renameFolderSchema = z.object({ name: folderNameField });

/** 移动文档：folderId 为 null 表示移出文件夹（未分类）。 */
export const moveDocumentSchema = z.object({
  folderId: uuidSchema.optional().nullable(),
});

export const organizeSchema = z.object({ kbId: uuidSchema });

/* ──────────────────────── 认证 ──────────────────────── */

/** 邮箱统一 trim + 转小写，避免同一邮箱因大小写/空格注册成两个账号 */
const emailField = z.string().email('邮箱格式不正确').trim().toLowerCase();

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, '请输入密码').max(200),
});

export const sendCodeSchema = z.object({ email: emailField });

export const registerSchema = z.object({
  email: emailField,
  password: z.string().min(8, '密码至少 8 位').max(200),
  name: z.string().trim().min(1).max(50).optional(),
  code: z.string().regex(/^\d{6}$/, '请输入 6 位数字验证码'),
});
