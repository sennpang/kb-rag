'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { AuthInput, AuthShell } from '@/components/auth-shell';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/chat';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.error) {
      // 不区分「用户不存在/密码错误」，避免账号枚举
      setError('邮箱或密码错误');
      setLoading(false);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-slate-500">邮箱</label>
        <AuthInput
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">密码</label>
        <AuthInput
          type="password"
          required
          autoComplete="current-password"
          placeholder="请输入密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {loading ? '登录中…' : '登录'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <AuthShell
        title="登录知识库"
        footer={
          <>
            还没有账号？
            <Link href="/register" className="ml-1 text-brand-600 hover:underline">
              立即注册
            </Link>
          </>
        }
      >
        <LoginForm />
      </AuthShell>
    </Suspense>
  );
}
