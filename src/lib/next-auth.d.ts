import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      /** 是否豁免配额限制（dev 模式或 QUOTA_WHITELIST_EMAILS 白名单） */
      quotaExempt?: boolean;
    } & DefaultSession['user'];
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string;
  }
}
