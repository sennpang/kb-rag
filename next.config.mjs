/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // mammoth 是纯 Node 库（依赖 node 内置模块），不交给 Next 打包
    // Next 14 的键名为 serverComponentsExternalPackages（Next 15+ 改为顶层 serverExternalPackages）
    serverComponentsExternalPackages: ['mammoth'],
  },
};

export default nextConfig;
