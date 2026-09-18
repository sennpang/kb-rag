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

export const chatRequestSchema = z.object({
  kbId: uuidSchema,
  conversationId: uuidSchema.optional().nullable(),
  messages: z.array(chatMessageSchema).min(1, '至少包含一条消息'),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const kbParamSchema = z.object({ kbId: uuidSchema });
export const idParamSchema = z.object({ id: uuidSchema });
export const chunkParamSchema = z.object({ id: uuidSchema, index: z.coerce.number().int().min(0) });
