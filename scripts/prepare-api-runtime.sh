#!/usr/bin/env bash
# 仅准备离线可部署的API目录；不安装系统服务、不启动程序、不操作生产数据库。
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:?请提供空的运行目录路径}"
cd "$REPO_ROOT"
pnpm build:shared
pnpm --filter @mirrorn/server build:bundle
# pnpm12 legacy生产打包会改工作区的依赖包含标记；明确恢复开发工具，不改锁文件。
if ! pnpm --filter @mirrorn/server deploy --prod --legacy "$DEST"; then
  pnpm install --frozen-lockfile --prod=false
  exit 1
fi
pnpm install --frozen-lockfile --prod=false
cp -a data "$DEST/data"
test -f "$DEST/dist/server.js"
test -f "$DEST/dist/index-worker.js"
echo "API运行目录已准备：$DEST（主进程与后台线程，含Redis客户端/解析器及WASM资源）"
