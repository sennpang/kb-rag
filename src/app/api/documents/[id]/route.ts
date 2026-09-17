import { deleteDocument, getDocument } from '@/lib/db/repositories';
import { ApiError, handleRoute } from '@/lib/http/route';

export const runtime = 'nodejs';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  return handleRoute(async () => {
    const doc = await getDocument(params.id);
    if (!doc) throw new ApiError('文档不存在', 404);

    await deleteDocument(doc.id); // chunks 经外键 CASCADE 一并删除
    return new Response(null, { status: 204 });
  });
}
