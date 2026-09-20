/** @type {import('next').NextConfig} */

// 安全响应头（CSP 允许 Next 必需的内联脚本/样式；无外部资源依赖）
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, // 防点击劫持（与 frame-ancestors 双保险）
  { key: 'X-Content-Type-Options', value: 'nosniff' }, // 防 MIME 嗅探
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
];

const nextConfig = {
  reactStrictMode: true,
  // 用户主目录存在无关 yarn.lock，显式锁定文件追踪根目录为本项目，避免 Next 误判（Node ≥20.11 支持）
  outputFileTracingRoot: import.meta.dirname,
  // mammoth 是纯 Node 库（依赖 node 内置模块），不交给 Next 打包
  // Next 15 已将该配置从 experimental 提升到顶层（Next 14 键名为 serverComponentsExternalPackages）
  serverExternalPackages: ['mammoth'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
