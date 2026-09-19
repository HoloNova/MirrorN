#!/usr/bin/env bash
#
# 把前端静态产物发布到 Caddy 托管的目录。
#
# 用法（需要 root，因为要写 /srv）：
#   sudo scripts/deploy-static.sh                 # 发布到 /srv/mirror.campuslink.vip
#   sudo scripts/deploy-static.sh /srv/other      # 换目标目录
#
# 为什么必须"复制产物"而不是让 Caddy 直接指向仓库目录：
#   仓库在 /root 下，caddy 用户没有读权限；而且让 Web 服务器读工作区会把部署和开发
#   耦合在一起（构建中途、切分支、脏工作区都会影响线上）。
#
# 目录结构：
#   <target>/current            当前版本（Caddy 的 root）
#   <target>/releases/<时间戳>  历史版本（硬链接快照，用于回滚），保留最近 5 份
set -euo pipefail

KEEP_RELEASES=5

TARGET_ROOT="${1:-/srv/mirror.campuslink.vip}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/apps/web/dist"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "需要 root 权限写入 $TARGET_ROOT，请用 sudo 运行。" >&2
  exit 1
fi

cd "$REPO_ROOT"

echo "==> 构建静态产物（pnpm build:web 内含数据校验）"
# VITE_API_BASE 默认指向同源 /api：公开部署由 Caddy 把 /api 反代到本机后端。
# 不想让页面请求任何接口时用 `MIRRORN_API_BASE= sudo scripts/deploy-static.sh`（纯静态行为）。
VITE_API_BASE="${MIRRORN_API_BASE-/}" pnpm build:web

if [[ ! -f "$SOURCE_DIR/index.html" ]]; then
  echo "构建产物缺少 index.html：$SOURCE_DIR" >&2
  exit 1
fi

RELEASE="$(date +%Y%m%d-%H%M%S)"
CURRENT_DIR="$TARGET_ROOT/current"
RELEASE_DIR="$TARGET_ROOT/releases/$RELEASE"

echo "==> 同步到 $CURRENT_DIR"
mkdir -p "$CURRENT_DIR" "$RELEASE_DIR"
# --delete：产物里的文件名带 hash，旧文件不删会无限增长。
rsync -a --delete "$SOURCE_DIR/" "$CURRENT_DIR/"

echo "==> 记录快照 $RELEASE_DIR（硬链接，不占额外空间）"
cp -al "$CURRENT_DIR/." "$RELEASE_DIR/" 2>/dev/null || cp -a "$CURRENT_DIR/." "$RELEASE_DIR/"

# 让 caddy 用户可读；站点是静态文件，不需要任何写权限。
chown -R root:root "$TARGET_ROOT"
chmod -R a+rX "$TARGET_ROOT"

echo "==> 清理旧快照（保留最近 $KEEP_RELEASES 份）"
if [[ -d "$TARGET_ROOT/releases" ]]; then
  # shellcheck disable=SC2012
  ls -1dt "$TARGET_ROOT"/releases/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf
fi

echo "==> 完成"
echo "当前版本：$CURRENT_DIR（快照 $RELEASE）"
echo "回滚示例：rm -rf $CURRENT_DIR && cp -a $TARGET_ROOT/releases/<时间戳> $CURRENT_DIR"
