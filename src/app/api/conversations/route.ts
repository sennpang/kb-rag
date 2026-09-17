import { NextRequest } from 'next/server';
import { listConversations } from '@/lib/db/repositories';
import { handleRoute, parseQuery } from '@/lib/http/route';
import { kbParamSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<Response> {
  return handleRoute(async () => {
    const { kbId } = parseQuery(req.nextUrl.searchParams, kbParamSchema);
    const conversations = await listConversations(kbId);
    return Response.json(conversations); // Conversation 与 ConversationDto 字段一致
  });
}
