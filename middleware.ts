import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

/**
 * 第一道鉴权（Edge，在请求到达应用前执行）：
 * 未登录访问页面 → 跳转 /login（携带 callbackUrl）；访问 API → 401 JSON。
 * /api/auth 不在 matcher 中，登录/注册/NextAuth 端点可匿名访问。
 *
 * 注意：受保护页面必须是动态渲染（见 chat/page.tsx 的 export const dynamic），
 * 否则会被构建期预渲染成静态页直接返回（X-Vercel-Cache: PRERENDER），绕过本 middleware。
 */
export default auth((req) => {
  if (req.auth) return;

  if (req.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.json({ error: '未登录或登录已过期' }, { status: 401 });
  }

  const loginUrl = new URL('/login', req.nextUrl);
  loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: [
    '/chat',
    '/chat/:path*',
    '/api/kb',
    '/api/kb/:path*',
    '/api/documents',
    '/api/documents/:path*',
    '/api/conversations',
    '/api/conversations/:path*',
    '/api/chat',
    '/api/chat/:path*',
  ],
};
