import { auth } from '@/auth';
import { ApiError } from '@/lib/http/route';

/** 服务端鉴权入口：返回当前用户 id；未登录统一抛 401，由 handleRoute 转 JSON。 */
export async function requireUserId(): Promise<string> {
  return (await requireUser()).id;
}

/** 服务端鉴权入口：返回当前用户 id 与邮箱（配额白名单按邮箱判断）。 */
export async function requireUser(): Promise<{ id: string; email: string | null }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new ApiError('未登录或登录已过期', 401);
  return { id: userId, email: session.user?.email ?? null };
}
