import { NextRequest } from 'next/server';
import {
  countKnowledgeBasesByOwner,
  createKnowledgeBase,
  listKnowledgeBases,
} from '@/lib/db/repositories';
import { handleRoute, parseJsonBody, ApiError } from '@/lib/http/route';
import { requireUserId } from '@/lib/auth/session';
import { createKbSchema } from '@/lib/validation/schemas';
import type { KnowledgeBaseDto } from '@/lib/types';

export const runtime = 'nodejs';

const KB_COUNT_LIMIT = 20; // 单用户知识库数量上限

export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const kbs = await listKnowledgeBases(userId);
    const dto: KnowledgeBaseDto[] = kbs.map(({ createdAt: _, ownerId: __, ...kb }) => kb);
    return Response.json(dto);
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { name } = await parseJsonBody(req, createKbSchema);

    if ((await countKnowledgeBasesByOwner(userId)) >= KB_COUNT_LIMIT) {
      throw new ApiError(`知识库数量已达 ${KB_COUNT_LIMIT} 个上限，请删除后再新建`, 429);
    }

    const kb = await createKnowledgeBase(name, userId);
    const { createdAt: _, ownerId: __, ...dto } = kb;
    return Response.json(dto satisfies KnowledgeBaseDto, { status: 201 });
  });
}
