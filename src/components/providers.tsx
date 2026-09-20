'use client';

import { SessionProvider } from 'next-auth/react';

/** 全局客户端 Provider：让任意客户端组件可用 useSession 读取登录态。 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
