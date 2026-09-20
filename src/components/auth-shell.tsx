import type { InputHTMLAttributes, ReactNode } from 'react';

/** 登录/注册页共享的视觉外壳与表单控件，保证两页风格一致、无重复样式。 */

export const AUTH_INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 placeholder:text-slate-300';

export function AuthInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input {...rest} className={`${AUTH_INPUT_CLASS} ${className ?? ''}`} />;
}

interface AuthShellProps {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthShell({ title, children, footer }: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium tracking-widest text-brand-500">RAG · KNOWLEDGE BASE</p>
          <h1 className="mt-1 text-lg font-semibold text-slate-800">{title}</h1>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
        <p className="mt-4 text-center text-xs text-slate-400">{footer}</p>
      </div>
    </main>
  );
}
