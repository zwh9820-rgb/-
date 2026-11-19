/** @type {import('next').NextConfig} */
const isDesktop = process.env.DESKTOP_BUILD === "1";

const nextConfig = {
  reactStrictMode: false,
  // 桌面端打包：导出为纯静态文件，由 Electron 外壳加载
  ...(isDesktop ? { output: "export", images: { unoptimized: true } } : {}),
};

export default nextConfig;
