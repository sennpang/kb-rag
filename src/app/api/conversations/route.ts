import { NextRequest } from 'next/server';
import { knowledgeBaseExists, listConversations } from '@/lib/db/repositories';
import { ApiError, handleRoute, parseQuery } from '@/lib/http/route';
import { requireUserId } from '@/lib/auth/session';
import { kbParamSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { kbId } = parseQuery(req.nextUrl.searchParams, kbParamSchema);
    if (!(await knowledgeBaseExists(kbId, userId))) throw new ApiError('知识库不存在', 404);
    const conversations = await listConversations(kbId);
    return Response.json(conversations); // Conversation 与 ConversationDto 字段一致
  });
}
