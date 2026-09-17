import { NextRequest } from 'next/server';
import { createKnowledgeBase, listKnowledgeBases } from '@/lib/db/repositories';
import { handleRoute, parseJsonBody } from '@/lib/http/route';
import { createKbSchema } from '@/lib/validation/schemas';
import type { KnowledgeBaseDto } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const kbs = await listKnowledgeBases();
    const dto: KnowledgeBaseDto[] = kbs.map(({ createdAt: _, ...kb }) => kb);
    return Response.json(dto);
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleRoute(async () => {
    const { name } = await parseJsonBody(req, createKbSchema);
    const kb = await createKnowledgeBase(name);
    const { createdAt: _, ...dto } = kb;
    return Response.json(dto satisfies KnowledgeBaseDto, { status: 201 });
  });
}
