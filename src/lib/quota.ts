import { env, isDev } from './env';

/**
 * 配额豁免判断（服务端统一入口）。
 *
 * 返回 true 的情况：
 * 1. 开发模式（next dev）——所有本地账号自动豁免；
 * 2. 用户邮箱在 QUOTA_WHITELIST_EMAILS 白名单中（逗号分隔，大小写不敏感）。
 *
 * 白名单通过环境变量配置：线上在部署平台（如 Vercel）的环境变量里
 * 添加/修改 QUOTA_WHITELIST_EMAILS 即可，无需改代码、无需重新发版
 * （已运行的进程需重新部署后生效）。
 */
export function isQuotaExempt(email: string | null | undefined): boolean {
  if (isDev) return true;
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  return getWhitelist().has(normalized);
}

/** 解析白名单环境变量为小写邮箱集合。 */
function getWhitelist(): Set<string> {
  return new Set(
    env.QUOTA_WHITELIST_EMAILS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}
