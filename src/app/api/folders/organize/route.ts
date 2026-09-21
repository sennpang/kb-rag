import { organizeUnclassified } from '@/lib/ai/classify';
import { knowledgeBaseExists } from '@/lib/db/repositories';
import { ApiError, handleRoute, parseJsonBody } from '@/lib/http/route';
import { requireUserId } from '@/lib/auth/session';
import { organizeSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
// 批量归类含多次模型调用；受平台函数时长上限约束，未整理完可再次触发
export const maxDuration = 60;

/** AI 一键整理：把知识库内未分类文档自动归入已有或新建的顶层文件夹。 */
export async function POST(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { kbId } = await parseJsonBody(req, organizeSchema);
    if (!(await knowledgeBaseExists(kbId, userId))) throw new ApiError('知识库不存在', 404);

    const result = await organizeUnclassified(kbId);
    return Response.json(result);
  });
}
