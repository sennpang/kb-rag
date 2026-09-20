'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { AuthInput, AuthShell } from '@/components/auth-shell';
import { sendVerificationCode } from '@/lib/api-client';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // 发送后 60s 倒计时（与后端限频一致）
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendCode = async () => {
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      setError('请先填写正确的邮箱地址');
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      await sendVerificationCode(normalized);
      setCooldown(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证码发送失败');
    } finally {
      setSendingCode(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name || undefined,
          code,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `注册失败（${res.status}）`);
      }

      // 注册成功 → 自动登录 → 进入问答页
      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (result?.error) throw new Error('自动登录失败，请前往登录页手动登录');
      router.push('/chat');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '注册失败');
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="创建账号"
      footer={
        <>
          已有账号？
          <Link href="/login" className="ml-1 text-brand-600 hover:underline">
            返回登录
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">昵称（可选）</label>
          <AuthInput
            type="text"
            autoComplete="nickname"
            placeholder="如何称呼你"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
          <label className="mb-1 block text-xs text-slate-500">邮箱验证码</label>
          <div className="flex gap-2">
            <AuthInput
              inputMode="numeric"
              required
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="6 位验证码"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <button
              type="button"
              onClick={() => void handleSendCode()}
              disabled={sendingCode || cooldown > 0}
              className="shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cooldown > 0 ? `${cooldown}s 后重发` : sendingCode ? '发送中…' : '发送验证码'}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">密码</label>
          <AuthInput
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="至少 8 位"
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
          {loading ? '注册中…' : '注册并进入'}
        </button>
      </form>
    </AuthShell>
  );
}
