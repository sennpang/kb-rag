import {
  deleteConversation,
  getConversation,
  knowledgeBaseExists,
  listMessages,
} from '@/lib/db/repositories';
import { ApiError, handleRoute, parseParams } from '@/lib/http/route';
import { requireUserId } from '@/lib/auth/session';
import { idParamSchema } from '@/lib/validation/schemas';
import type { MessageDto } from '@/lib/types';
import { estimateCost } from '@/lib/ai/pricing';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/** 会话详情：会话元信息 + 全部历史消息（用于切换会话时恢复） */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = parseParams(await params, idParamSchema);

    const conversation = await getConversation(id);
    if (!conversation) throw new ApiError('会话不存在', 404);
    if (!(await knowledgeBaseExists(conversation.kbId, userId))) {
      throw new ApiError('会话不存在', 404);
    }

    const messages = await listMessages(conversation.id);
    const dto: MessageDto[] = messages
      .filter((m): m is typeof m & { role: 'user' | 'assistant' } => m.role !== 'system')
      .map((m) => {
        // 历史消息按当前模型定价、消息创建时刻的峰谷现场估算；中断未落 usage 的不估算
        const cost =
          m.role === 'assistant' && m.tokenInput != null
            ? estimateCost(
                env.LLM_MODEL,
                { input: m.tokenInput, output: m.tokenOutput ?? 0 },
                new Date(m.createdAt),
              )
            : null;
        return {
          id: m.id,
          role: m.role,
          content: m.content,
          sources: Array.isArray(m.sources) ? (m.sources as MessageDto['sources']) : [],
          tokenInput: m.tokenInput,
          tokenOutput: m.tokenOutput,
          cost,
        };
      });

    return Response.json({ conversation, messages: dto });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = parseParams(await params, idParamSchema);

    // 删除前先验归属：否则任何登录用户可凭 UUID 删除他人会话
    const conversation = await getConversation(id);
    if (!conversation) throw new ApiError('会话不存在', 404);
    if (!(await knowledgeBaseExists(conversation.kbId, userId))) {
      throw new ApiError('会话不存在', 404);
    }

    await deleteConversation(id);
    return new Response(null, { status: 204 });
  });
}
