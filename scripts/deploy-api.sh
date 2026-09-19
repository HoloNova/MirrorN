#!/usr/bin/env bash
#
# 发布 MirrorN 后端（同步状态聚合 API）到本机 systemd 服务。
#
# 用法（需要 root）：
#   sudo scripts/deploy-api.sh
#
# 做了什么：
#   1. 用 esbuild 把服务端打成单文件（不需要把 node_modules 一起部署）；
#   2. 同步 server.js 与 data/ 到 /srv/mirrorn/api；
#   3. 首次运行时创建系统用户 mirrorn、快照目录与 /etc/mirrorn/api.env（含随机 secret）；
#   4. 安装/更新 systemd 单元并重启服务；
#   5. 本机健康检查。
#
# 不做的事：不碰 Caddy 配置（/api 反代由 deploy/Caddyfile.mirror 提供，见 docs/deployment.md）。
set -euo pipefail

SERVICE_NAME="mirrorn-api"
SERVICE_USER="mirrorn"
API_ROOT="/srv/mirrorn/api"
ENV_DIR="/etc/mirrorn"
ENV_FILE="$ENV_DIR/api.env"
STATE_DIR="/var/lib/mirrorn"
NODE_BIN="/usr/local/bin/node"
NODE_MIN_MAJOR=20
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "需要 root 权限，请用 sudo 运行。" >&2
  exit 1
fi

# 校验 Node 版本：系统自带的 /usr/bin/node 在部分发行版上还是 v12，
# 运行打包产物时会直接 SIGILL 崩溃（这是实际踩过的坑），所以先把关。
if [[ ! -x "$NODE_BIN" ]]; then
  echo "找不到可执行文件：$NODE_BIN（systemd 单元里写死了这个路径）。" >&2
  echo "请安装 Node 20+ 到该路径，或同步修改 deploy/$SERVICE_NAME.service。" >&2
  exit 1
fi
node_major="$("$NODE_BIN" --version | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "$node_major" -lt "$NODE_MIN_MAJOR" ]]; then
  echo "$NODE_BIN 的版本过低（$("$NODE_BIN" --version)），需要 v$NODE_MIN_MAJOR 以上。" >&2
  exit 1
fi

echo "==> 使用 $NODE_BIN（$("$NODE_BIN" --version)）"

cd "$REPO_ROOT"

echo "==> 打包服务端（单文件）"
pnpm build:shared >/dev/null
pnpm --filter @mirrorn/server build:bundle

if [[ ! -f apps/server/dist/server.js ]]; then
  echo "打包产物缺失：apps/server/dist/server.js" >&2
  exit 1
fi

echo "==> 创建用户与目录"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$API_ROOT" --shell /usr/sbin/nologin "$SERVICE_USER"
fi
mkdir -p "$API_ROOT" "$ENV_DIR" "$STATE_DIR"

echo "==> 同步产物与数据"
install -m 0644 -o root -g root apps/server/dist/server.js "$API_ROOT/server.js"
# 数据目录随部署一起复制：服务端运行时按 MIRRORN_DATA_DIR 读取，
# 因此 /srv 下的这份就是它唯一的数据来源（不需要读仓库）。
rm -rf "$API_ROOT/data"
cp -a data "$API_ROOT/data"
chown -R root:root "$API_ROOT"
chmod -R a+rX "$API_ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> 生成 $ENV_FILE（含随机 secret，不会覆盖已存在的文件）"
  secret="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  sed "s/^MIRRORN_FINGERPRINT_SECRET=.*/MIRRORN_FINGERPRINT_SECRET=$secret/" \
    deploy/api.env.example > "$ENV_FILE"
  chown root:"$SERVICE_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
else
  echo "==> 保留已有 $ENV_FILE"
fi

chown -R "$SERVICE_USER":"$SERVICE_USER" "$STATE_DIR"
chmod 0750 "$STATE_DIR"

echo "==> 安装 systemd 单元"
install -m 0644 -o root -g root deploy/"$SERVICE_NAME".service /etc/systemd/system/"$SERVICE_NAME".service
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null

port="$(grep -E '^MIRRORN_PORT=' "$ENV_FILE" | cut -d= -f2)"
host="$(grep -E '^MIRRORN_HOST=' "$ENV_FILE" | cut -d= -f2)"

# 端口预检：如果有别的进程（例如 dev 工作流的后端）占着这个端口，服务会启动失败，
# 而此时 curl 却能拿到 200——那并不是我们的服务在回答。宁可直接失败并说清楚。
if ss -ltnp 2>/dev/null | grep -q ":$port "; then
  holder="$(ss -ltnp 2>/dev/null | grep ":$port " | tr -s ' ' | cut -d' ' -f6-)"
  echo "端口 $port 已被占用，服务无法启动：" >&2
  echo "  $holder" >&2
  echo "请先停掉占用者（dev 后端在 8787，生产后端在 $port，两者不应相同）。" >&2
  exit 1
fi

systemctl restart "$SERVICE_NAME"

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "服务未能保持运行，最近日志：" >&2
  journalctl -u "$SERVICE_NAME" -n 20 --no-pager >&2
  exit 1
fi

echo "==> 健康检查（同时确认监听者是本服务）"
main_pid="$(systemctl show -p MainPID --value "$SERVICE_NAME")"
listener_pid="$(ss -ltnp 2>/dev/null | grep ":$port " | sed -E 's/.*pid=([0-9]+).*/\1/' | head -1)"
if [[ -n "$listener_pid" && "$listener_pid" != "$main_pid" ]]; then
  echo "端口 $port 的监听者（pid $listener_pid）不是本服务（pid $main_pid）。" >&2
  exit 1
fi

for _ in 1 2 3 4 5; do
  if curl -fsS "http://${host}:${port}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl -fsS "http://${host}:${port}/api/health" && echo
echo "==> 状态接口（首次同步可能还在进行）"
curl -fsS "http://${host}:${port}/api/mirrors" | head -c 400 && echo

echo "==> 网络指纹接口（确认 secret 已生效）"
curl -fsS "http://${host}:${port}/api/net-fingerprint" && echo

echo
echo "完成。查看日志：journalctl -u $SERVICE_NAME -n 50 --no-pager"
echo "Caddy 反代：把 deploy/Caddyfile.mirror 里的 /api 段合并进 /etc/caddy/Caddyfile 后 systemctl reload caddy"
