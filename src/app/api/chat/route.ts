import { convertToCoreMessages, streamText, type UIMessage } from 'ai';
import { getChatModel } from '@/lib/ai/provider';
import { estimateCost } from '@/lib/ai/pricing';
import { env } from '@/lib/env';
import { buildSystemPrompt, toSourceItems } from '@/lib/ai/prompts';
import {
  countRecentChatsByOwner,
  createConversation,
  getConversation,
  insertMessage,
  knowledgeBaseExists,
} from '@/lib/db/repositories';
import { hybridRetrieve } from '@/lib/rag/retrieve';
import { ApiError, handleRoute, parseJsonBody } from '@/lib/http/route';
import { sseResponse } from '@/lib/http/sse';
import { requireUser } from '@/lib/auth/session';
import { isQuotaExempt } from '@/lib/quota';
import { chatRequestSchema, chatRequestExemptSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
// Vercel Hobby 函数超时上限 60s；流式回答在此时间内持续返回，不占用平台缓冲
export const maxDuration = 60;

// chat 接口配额（计费接口：LLM + 查询向量化均真实计费）
const CHAT_HOURLY_LIMIT = 50;
const CHAT_DAILY_LIMIT = 300;

/**
 * POST /api/chat：检索 → 落库 → 流式生成。
 * 自定义 SSE 协议（便于携带 sources 等业务事件）：meta → sources → delta* → done | error
 */
export async function POST(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const { id: userId, email } = await requireUser();
    const quotaExempt = isQuotaExempt(email);
    const { kbId, conversationId, messages } = await parseJsonBody(
      req,
      quotaExempt ? chatRequestExemptSchema : chatRequestSchema,
    );
    if (!(await knowledgeBaseExists(kbId, userId))) throw new ApiError('知识库不存在', 404);

    // dev 模式 / 白名单账号不限提问频率
    if (!quotaExempt) {
      const [chatsHourly, chatsDaily] = await Promise.all([
        countRecentChatsByOwner(userId, 3600),
        countRecentChatsByOwner(userId, 86400),
      ]);
      if (chatsHourly >= CHAT_HOURLY_LIMIT) {
        throw new ApiError('提问过于频繁，请 1 小时后再试', 429);
      }
      if (chatsDaily >= CHAT_DAILY_LIMIT) {
        throw new ApiError('今日提问次数已达上限，请明天再试', 429);
      }
    }

    const question = [...messages].reverse().find((m) => m.role === 'user')?.content.trim();
    if (!question) throw new ApiError('缺少用户提问', 422);

    // 检索失败不向客户端透传内部细节（组件/SQL 信息），细节仅记录服务端日志
    const contexts = await hybridRetrieve(kbId, question).catch((error) => {
      console.error('[chat] 检索失败：', error);
      throw new ApiError('知识检索失败，请稍后重试', 500);
    });
    const sources = toSourceItems(contexts);
    const targetConversationId = await resolveConversation(kbId, conversationId ?? undefined, question);
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
        // 模型返回的真实 usage（非估算），随 done 帧交给前端展示；onFinish 已完成落库
        const usage = await result.usage;
        const tokenUsage = { input: usage.promptTokens, output: usage.completionTokens };
        send({
          type: 'done',
          usage: tokenUsage,
          // 金额为估算上限：输入按缓存未命中价计，实际命中缓存更低
          cost: estimateCost(env.LLM_MODEL, tokenUsage),
        });
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
