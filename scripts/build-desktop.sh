#!/usr/bin/env bash
# 一键构建 Windows 桌面应用
set -e
cd "$(dirname "$0")/.."

echo "==> 1/3 导出 Next.js 静态站点"
DESKTOP_BUILD=1 npx next build

echo "==> 2/3 生成图标"
node scripts/gen-icon.cjs

echo "==> 3/3 打包 Electron 应用"
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder/"
npx electron-builder --win --x64

echo "==> 完成，产物在 dist/ 目录"
