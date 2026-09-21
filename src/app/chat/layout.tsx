import { redirect } from 'next/navigation';
import { auth } from '@/auth';

/**
 * /chat 段的服务端鉴权 + 强制动态渲染。
 *
 * 为什么需要它（而不仅靠 middleware）：
 * chat/page.tsx 是纯 'use client' 页面，构建期会被预渲染成静态 HTML；
 * Vercel 可能直接返回该预渲染产物（X-Nextjs-Prerender: 1），绕过 middleware，
 * 导致未登录也能打开页面。在这个服务端 layout 中调用 auth() 会读取 cookie，
 * 使整段变为动态渲染（不再预渲染），并对未登录请求直接跳转登录页（双保险）。
 */
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  return children;
}
