import { deleteConversation, getConversation, listMessages } from '@/lib/db/repositories';
import { ApiError, handleRoute, parseParams } from '@/lib/http/route';
import { idParamSchema } from '@/lib/validation/schemas';
import type { MessageDto } from '@/lib/types';

export const runtime = 'nodejs';

/** 会话详情：会话元信息 + 全部历史消息（用于切换会话时恢复） */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  return handleRoute(async () => {
    const { id } = parseParams(params, idParamSchema);

    const conversation = await getConversation(id);
    if (!conversation) throw new ApiError('会话不存在', 404);

    const messages = await listMessages(conversation.id);
    const dto: MessageDto[] = messages
      .filter((m): m is typeof m & { role: 'user' | 'assistant' } => m.role !== 'system')
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: Array.isArray(m.sources) ? (m.sources as MessageDto['sources']) : [],
      }));

    return Response.json({ conversation, messages: dto });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  return handleRoute(async () => {
    const { id } = parseParams(params, idParamSchema);
    await deleteConversation(id);
    return new Response(null, { status: 204 });
  });
}
