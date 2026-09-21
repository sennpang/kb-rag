import {
  deleteDocument,
  getDocument,
  getFolder,
  knowledgeBaseExists,
  setDocumentFolder,
} from '@/lib/db/repositories';
import { ApiError, handleRoute, parseJsonBody } from '@/lib/http/route';
import { requireUserId } from '@/lib/auth/session';
import { moveDocumentSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

/** 移动文档：folderId 为 null 表示移出文件夹；目标文件夹必须与文档同库。 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    const { folderId } = await parseJsonBody(req, moveDocumentSchema);

    const doc = await getDocument(id);
    if (!doc) throw new ApiError('文档不存在', 404);
    if (!(await knowledgeBaseExists(doc.kbId, userId))) throw new ApiError('文档不存在', 404);

    if (folderId) {
      const folder = await getFolder(folderId);
      // 拒绝跨库移动；不存在同样 404 防枚举
      if (!folder || folder.kbId !== doc.kbId) throw new ApiError('目标文件夹不存在', 404);
    }

    await setDocumentFolder(doc.id, folderId ?? null);
    return Response.json({ ok: true });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    const doc = await getDocument(id);
    if (!doc) throw new ApiError('文档不存在', 404);
    // 归属不符同样返回 404，避免向其他用户暴露资源存在性
    if (!(await knowledgeBaseExists(doc.kbId, userId))) throw new ApiError('文档不存在', 404);

    await deleteDocument(doc.id); // chunks 经外键 CASCADE 一并删除
    return new Response(null, { status: 204 });
  });
}
