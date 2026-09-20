import { auth } from '@/auth';
import { ApiError } from '@/lib/http/route';

/** 服务端鉴权入口：返回当前用户 id；未登录统一抛 401，由 handleRoute 转 JSON。 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new ApiError('未登录或登录已过期', 401);
  return userId;
}
