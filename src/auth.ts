import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { getUserByEmail } from '@/lib/db/repositories';
import { verifyPassword } from '@/lib/auth/password';
import { loginSchema } from '@/lib/validation/schemas';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // 本地/自建反代默认不在可信框架白名单，必须显式信任 Host；Vercel 平台虽自动注入，显式声明确保各环境一致
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      /** 返回 null 表示凭证无效（Auth.js 转为 CredentialsSignin 错误）；成功返回最小用户对象写入 JWT。 */
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await getUserByEmail(email);
        if (!user) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
