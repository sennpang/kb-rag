import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

/**
 * 第一道鉴权（Edge，在请求到达应用前执行）：
 * 未登录访问页面 → 跳转 /login（携带 callbackUrl）；访问 API → 401 JSON。
 * /api/auth 不在 matcher 中，登录/注册/NextAuth 端点可匿名访问。
 */
export default auth((req) => {
  if (req.auth) return;

  if (req.nextUrl.pathname.startsWith('/api')) {
    return Response.json({ error: '未登录或登录已过期' }, { status: 401 });
  }

  const loginUrl = new URL('/login', req.nextUrl);
  loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
  return Response.redirect(loginUrl);
});

export const config = {
  matcher: [
    '/chat/:path*',
    '/api/kb/:path*',
    '/api/documents/:path*',
    '/api/conversations/:path*',
    '/api/chat/:path*',
  ],
};
