import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe 配置（middleware 中使用）：
 * 只能包含不依赖 Node API 的内容——bcrypt / 数据库访问放在 src/auth.ts 的 Credentials provider 中。
 */
export const authConfig = {
  pages: {
    signIn: '/login', // 未登录访问受保护页面时的跳转目标
  },
  session: { strategy: 'jwt' },
  providers: [], // 在 src/auth.ts 补充 Credentials
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      // 注入配额豁免标记（口径须与 src/lib/quota.ts 的 isQuotaExempt 保持一致）。
      // 此处直接读 process.env 而非导入 env.ts，保证本配置在 Edge runtime 可用。
      const email = session.user.email?.trim().toLowerCase();
      const whitelist = new Set(
        (process.env.QUOTA_WHITELIST_EMAILS ?? '')
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      );
      session.user.quotaExempt =
        process.env.NODE_ENV === 'development' || (!!email && whitelist.has(email));
      return session;
    },
  },
} satisfies NextAuthConfig;
