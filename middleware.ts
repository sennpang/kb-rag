import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

/**
 * 第一道鉴权（Edge，在请求到达应用前执行）：
 * 未登录访问页面 → 跳转 /login（携带 callbackUrl）；访问 API → 401 JSON。
 * /api/auth 不在 matcher 中，登录/注册/NextAuth 端点可匿名访问。
 */
export default auth((req) => {
  const isApi = req.nextUrl.pathname.startsWith('/api');
  const debug = {
    authed: req.auth ? '1' : '0',
    hasCookie: req.cookies.has('authjs.session-token') || req.cookies.has('__Secure-authjs.session-token') ? '1' : '0',
  };
  const head = {
    'x-debug-authed': debug.authed,
    'x-debug-cookie': debug.hasCookie,
  };

  if (req.auth) {
    // 已登录：放行（页面响应上附带调试头，API 保持原 Next 行为）
    return isApi ? undefined : NextResponse.next({ headers: head });
  }

  if (isApi) {
    return NextResponse.json({ error: '未登录或登录已过期' }, { status: 401, headers: head });
  }

  const loginUrl = new URL('/login', req.nextUrl);
  loginUrl.searchParams.set('debug', '1');
  loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl, { headers: head });
});

export const config = {
  matcher: [
    // 显式列出裸路径：':path*' 在部分 Next 版本对无尾斜杠的精确路径匹配不稳定，
    // 不写 '/chat' 会导致未登录直接访问 /chat 时不跳转登录页
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
