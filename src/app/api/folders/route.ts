import { NextRequest } from 'next/server';
import {
  getFolder,
  insertFolder,
  knowledgeBaseExists,
  listFolders,
} from '@/lib/db/repositories';
import { ApiError, handleRoute, parseJsonBody, parseQuery } from '@/lib/http/route';
import { requireUserId } from '@/lib/auth/session';
import { createFolderSchema, kbParamSchema } from '@/lib/validation/schemas';
import type { FolderDto } from '@/lib/types';

export const runtime = 'nodejs';

/** 列出知识库内全部文件夹（前端自行按 parentId 组装树）。 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { kbId } = parseQuery(req.nextUrl.searchParams, kbParamSchema);
    if (!(await knowledgeBaseExists(kbId, userId))) throw new ApiError('知识库不存在', 404);

    const folders = await listFolders(kbId);
    const dto: FolderDto[] = folders.map(({ createdAt: _, ...f }) => f);
    return Response.json(dto);
  });
}

/** 新建文件夹（parentId 缺省为顶层；同级同名 → 409）。 */
export async function POST(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { kbId, name, parentId } = await parseJsonBody(req, createFolderSchema);
    if (!(await knowledgeBaseExists(kbId, userId))) throw new ApiError('知识库不存在', 404);

    if (parentId) {
      const parent = await getFolder(parentId);
      // 父文件夹必须与新文件夹同库；不符按 404 处理，防枚举与跨库挂载
      if (!parent || parent.kbId !== kbId) throw new ApiError('父文件夹不存在', 404);
    }

    try {
      const folder = await insertFolder({ kbId, parentId: parentId ?? null, name });
      return Response.json({ id: folder.id, kbId: folder.kbId, parentId: folder.parentId, name: folder.name }, { status: 201 });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError('同级已存在同名文件夹', 409);
      }
      throw error;
    }
  });
}
