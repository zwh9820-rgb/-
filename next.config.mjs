/** @type {import('next').NextConfig} */
const isDesktop = process.env.DESKTOP_BUILD === "1";

const nextConfig = {
  reactStrictMode: false,
  // 允许指定构建缓存目录：Windows 下 .next/trace 偶发被占用时可用 NEXT_DIST_DIR 绕开
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // 桌面端打包：导出为纯静态文件，由 Electron 外壳加载
  ...(isDesktop ? { output: "export", images: { unoptimized: true } } : {}),
};

export default nextConfig;
