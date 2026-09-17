import { convertToCoreMessages, streamText, type UIMessage } from 'ai';
import { getChatModel } from '@/lib/ai/provider';
import { buildSystemPrompt, toSourceItems } from '@/lib/ai/prompts';
import {
  createConversation,
  getConversation,
  insertMessage,
  knowledgeBaseExists,
} from '@/lib/db/repositories';
import { hybridRetrieve } from '@/lib/rag/retrieve';
import { ApiError, handleRoute, parseJsonBody } from '@/lib/http/route';
import { sseResponse } from '@/lib/http/sse';
import { chatRequestSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
// Vercel Hobby 函数超时上限 60s；流式回答在此时间内持续返回，不占用平台缓冲
export const maxDuration = 60;

/**
 * POST /api/chat：检索 → 落库 → 流式生成。
 * 自定义 SSE 协议（便于携带 sources 等业务事件）：meta → sources → delta* → done | error
 */
export async function POST(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const { kbId, conversationId, messages } = await parseJsonBody(req, chatRequestSchema);
    if (!(await knowledgeBaseExists(kbId))) throw new ApiError('知识库不存在', 404);

    const question = [...messages].reverse().find((m) => m.role === 'user')?.content.trim();
    if (!question) throw new ApiError('缺少用户提问', 422);

    const contexts = await hybridRetrieve(kbId, question).catch((error) => {
      throw new ApiError(
        `检索失败：${error instanceof Error ? error.message : String(error)}`,
        500,
      );
    });
    const sources = toSourceItems(contexts);
    const targetConversationId = await resolveConversation(kbId, conversationId, question);
    await insertMessage({ conversationId: targetConversationId, role: 'user', content: question });

    return sseResponse(async ({ send, signal }) => {
      send({ type: 'meta', conversationId: targetConversationId });
      send({ type: 'sources', items: sources });

      try {
        const result = streamText({
          model: getChatModel(),
          system: buildSystemPrompt(contexts),
          messages: convertToCoreMessages(messages as UIMessage[]),
          temperature: 0.3,
          abortSignal: signal,
          onFinish: async ({ text, usage }) => {
            await insertMessage({
              conversationId: targetConversationId,
              role: 'assistant',
              content: text,
              sources,
              tokenInput: usage.promptTokens,
              tokenOutput: usage.completionTokens,
            });
          },
        });

        for await (const delta of result.textStream) {
          send({ type: 'delta', delta });
        }
        send({ type: 'done' });
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : '生成失败，请稍后重试',
        });
      }
    });
  });
}

/** 复用已有会话（校验归属）或以问题为题新建会话。 */
async function resolveConversation(
  kbId: string,
  conversationId: string | undefined,
  question: string,
): Promise<string> {
  if (conversationId) {
    const existing = await getConversation(conversationId);
    if (!existing || existing.kbId !== kbId) throw new ApiError('会话不存在', 404);
    return existing.id;
  }
  const created = await createConversation(kbId, question.slice(0, 24) || '新会话');
  return created.id;
}
