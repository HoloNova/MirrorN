#!/usr/bin/env bash
#
# 发布 MirrorN 后端（资源目录与镜像站 API）到本机 systemd 服务。
#
# 用法（需要 root）：
#   sudo scripts/deploy-api.sh
#
# 做了什么：
#   1. 准备API/采集线程与生产依赖的独立运行目录（仅保留安装目录解析与BullMQ依赖）；
#   2. 验证Redis，再同步dist/node_modules/data到 /srv/mirrorn/api；
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
NODE_MIN_MAJOR=24
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "需要 root 权限，请用 sudo 运行。" >&2
  exit 1
fi

# 校验 Node 版本：系统自带的 /usr/bin/node 在部分发行版上还是 v12，
# 运行打包产物时会直接 SIGILL 崩溃（这是实际踩过的坑），所以先把关。
if [[ ! -x "$NODE_BIN" ]]; then
  echo "找不到可执行文件：$NODE_BIN（systemd 单元里写死了这个路径）。" >&2
  echo "请安装 Node 24+ 到该路径，或同步修改 deploy/$SERVICE_NAME.service。" >&2
  exit 1
fi
node_major="$("$NODE_BIN" --version | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "$node_major" -lt "$NODE_MIN_MAJOR" ]]; then
  echo "$NODE_BIN 的版本过低（$("$NODE_BIN" --version)），需要 v$NODE_MIN_MAJOR 以上。" >&2
  exit 1
fi

echo "==> 使用 $NODE_BIN（$("$NODE_BIN" --version)）"

cd "$REPO_ROOT"

# 升级现有包库时，先由后台准备新的安装目录；不能发布空新库使首页突然消失。
if [[ -f "$STATE_DIR/mirrorn.sqlite" ]]; then
  "$NODE_BIN" --input-type=module - "$STATE_DIR/mirrorn-installers.sqlite" <<'NODE'
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
const path=process.argv[2];
if(!existsSync(path))throw new Error('新安装目录未准备好：先执行 scripts/prepare-installer-catalog.ts；本次不替换运行程序');
const db=new DatabaseSync(path,{readOnly:true});
try {
  const ready=db.prepare(`SELECT DISTINCT w.slug FROM catalog_downloads d JOIN catalog_versions v ON v.id=d.version_id JOIN catalog_software w ON w.id=v.software_id`).all();
  for(const slug of ['nodejs','anaconda-installer','anaconda-distribution','r-cran'])
    if(!ready.some(row=>row.slug===slug))throw new Error(`${slug}未就绪：不替换现用API`);
}finally{db.close();}
NODE
fi

echo "==> 准备API及采集线程运行目录"
STAGING="$(mktemp -d /tmp/mirrorn-api-runtime.XXXXXX)"
trap 'rm -rf "$STAGING"' EXIT
bash scripts/prepare-api-runtime.sh "$STAGING"
# Redis由独立运维配置提供；部署脚本不自动安装/启动系统服务。
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi
if [[ "${MIRRORN_CRAWL_ENABLED:-true}" != "false" ]]; then
  MIRRORN_REDIS_URL="${MIRRORN_REDIS_URL:-redis://127.0.0.1:6389/0}" "$NODE_BIN" scripts/check-index-redis.mjs "$STAGING"
fi

# 开发阶段抓取数据可重新生成：按用户规则不备份数据库、不复制历史抓取文件。
echo "==> 抓取数据不备份；新目录就绪后切换API"

echo "==> 创建用户与目录"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$API_ROOT" --shell /usr/sbin/nologin "$SERVICE_USER"
fi
mkdir -p "$API_ROOT" "$ENV_DIR" "$STATE_DIR"

echo "==> 同步产物与数据"
rsync -a --delete "$STAGING/dist/" "$API_ROOT/dist/"
rsync -a --delete "$STAGING/node_modules/" "$API_ROOT/node_modules/"
install -m 0644 -o root -g root "$STAGING/package.json" "$API_ROOT/package.json"
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

# 端口预检：首次发布不允许借用其它监听者；再次发布允许本服务持有生产端口。
# 之前一律拒绝已占用端口，会让生产 API 自己阻止其后的每次更新。
#
# 注意：这里的管道不用 `head` 收尾——`set -o pipefail` 下 `head` 提前关闭读端会让上游
# 管道收到 SIGPIPE（141），脚本会在没有输出任何提示的情况下直接退出（实际踩过）。
if ss -ltnp 2>/dev/null | grep -q ":$port "; then
  holder="$(ss -ltnp 2>/dev/null | grep ":$port " | tr -s ' ' | cut -d' ' -f6-)"
  holder_pids="$(printf '%s' "$holder" | sed -nE 's/.*pid=([0-9]+).*/\1/p')"
  holder_pid="${holder_pids%%$'\n'*}"
  running_pid="$(systemctl show -p MainPID --value "$SERVICE_NAME")"
  if [[ -z "$holder_pid" || "$running_pid" == "0" || "$holder_pid" != "$running_pid" ]] || ! systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "端口 $port 被非本服务占用，拒绝重启：$holder" >&2
    exit 1
  fi
  echo "==> 当前生产 API 持有端口 $port（PID $running_pid），允许原服务就地更新"
fi

systemctl restart "$SERVICE_NAME"

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "服务未能保持运行，最近日志：" >&2
  journalctl -u "$SERVICE_NAME" -n 20 --no-pager >&2
  exit 1
fi

echo "==> 健康检查（同时确认监听者是本服务）"
main_pid="$(systemctl show -p MainPID --value "$SERVICE_NAME")"
listener_pids="$(ss -ltnp 2>/dev/null | sed -nE "s/.*:$port .*pid=([0-9]+).*/\1/p" || true)"
listener_pid="${listener_pids%%$'\n'*}"
if [[ -n "$listener_pid" && "$listener_pid" != "$main_pid" ]]; then
  echo "端口 $port 的监听者（pid $listener_pid）不是本服务（pid $main_pid）。" >&2
  exit 1
fi

health=0
for _ in 1 2 3 4 5 6 7 8; do
  if curl -fsS --max-time 5 "http://${host}:${port}/api/health" >/dev/null 2>&1; then
    health=1
    break
  fi
  sleep 1
done

if [[ "$health" != 1 ]]; then
  echo "健康检查失败：http://${host}:${port}/api/health 连续 8 次未就绪，最近日志：" >&2
  journalctl -u "$SERVICE_NAME" -n 20 --no-pager >&2
  exit 1
fi

curl -fsS --max-time 5 "http://${host}:${port}/api/health" && echo
echo "==> 状态接口（首次同步可能还在进行）"
mirrors_json="$(curl -fsS --max-time 5 "http://${host}:${port}/api/mirrors")"
printf '%s\n' "${mirrors_json:0:400}"

echo "==> 资源库接口（生态筛选与文件目录）"
ecosystems="$(curl -fsS --max-time 5 "http://${host}:${port}/api/ecosystems")"
printf '生态：%s…\n' "${ecosystems:0:160}"
resources="$(curl -fsS --max-time 5 "http://${host}:${port}/api/resources?downloadable=1&limit=3")"
printf '资源：%s…\n' "${resources:0:160}"
pku_files="$(curl -fsS --max-time 5 "http://${host}:${port}/api/resources/pku%3Aanaconda")"
printf '北大文件：%s…\n' "${pku_files:0:160}"

echo "==> 网络指纹接口（确认 secret 已生效）"
curl -fsS "http://${host}:${port}/api/net-fingerprint" && echo

echo
echo "完成。查看日志：journalctl -u $SERVICE_NAME -n 50 --no-pager"
echo "Caddy 反代：把 deploy/Caddyfile.mirror 里的 /api 段合并进 /etc/caddy/Caddyfile 后 systemctl reload caddy"
