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
      return session;
    },
  },
} satisfies NextAuthConfig;
