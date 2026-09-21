import {
  deleteFolder,
  getFolder,
  knowledgeBaseExists,
  renameFolder,
} from '@/lib/db/repositories';
import { ApiError, handleRoute, parseJsonBody } from '@/lib/http/route';
import { requireUserId } from '@/lib/auth/session';
import { renameFolderSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

/** 重命名文件夹（同级同名由唯一索引兜底 → 409）。 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    const { name } = await parseJsonBody(req, renameFolderSchema);

    const folder = await getFolder(id);
    if (!folder) throw new ApiError('文件夹不存在', 404);
    if (!(await knowledgeBaseExists(folder.kbId, userId))) {
      throw new ApiError('文件夹不存在', 404);
    }

    try {
      await renameFolder(id, name);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError('同级已存在同名文件夹', 409);
      }
      throw error;
    }
    return Response.json({ ok: true });
  });
}

/**
 * 删除文件夹：子文件夹级联删除，子树内文档变为「未分类」（不删除文档）。
 * 前端须弹窗明确告知后果。
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await params;

    const folder = await getFolder(id);
    if (!folder) throw new ApiError('文件夹不存在', 404);
    if (!(await knowledgeBaseExists(folder.kbId, userId))) {
      throw new ApiError('文件夹不存在', 404);
    }

    await deleteFolder(id);
    return new Response(null, { status: 204 });
  });
}
