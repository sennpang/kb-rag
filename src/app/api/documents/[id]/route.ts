import { deleteDocument, getDocument, knowledgeBaseExists } from '@/lib/db/repositories';
import { ApiError, handleRoute } from '@/lib/http/route';
import { requireUserId } from '@/lib/auth/session';

export const runtime = 'nodejs';

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
