import { getChunkWithContext, knowledgeBaseExists } from '@/lib/db/repositories';
import { ApiError, handleRoute, parseParams } from '@/lib/http/route';
import { requireUserId } from '@/lib/auth/session';
import { chunkParamSchema } from '@/lib/validation/schemas';
import type { ChunkContextDto } from '@/lib/types';

export const runtime = 'nodejs';

/** 引用溯源：返回命中切片及其前后相邻切片，供前端高亮展示上下文。 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id, index } = parseParams(await params, chunkParamSchema);

    const result = await getChunkWithContext(id, index);
    if (!result) throw new ApiError('切片不存在', 404);
    if (!(await knowledgeBaseExists(result.current.kbId, userId))) {
      throw new ApiError('切片不存在', 404);
    }

    const dto: ChunkContextDto = {
      current: {
        id: result.current.id,
        docId: result.current.docId,
        chunkIndex: result.current.chunkIndex,
        content: result.current.content,
      },
      previous: result.previous && {
        chunkIndex: result.previous.chunkIndex,
        content: result.previous.content,
      },
      next: result.next && {
        chunkIndex: result.next.chunkIndex,
        content: result.next.content,
      },
    };
    return Response.json(dto);
  });
}
