# 部署：静态预览版

本文档记录 `mirror.campuslink.vip` 的静态部署方式。它对应 `PLAN.md` 6.3 中“静态构建托管”的部分；`PLAN.md` 明确“阶段 3 完成即可发布静态预览版，阶段 6 完成才算首版正式可交付”，因此这里的发布不改变阶段划分。

## 交付形态

前端是一个使用 hash 路由的纯静态站点：所有数据（镜像、生态、排错、探针配置）都随构建产物一起打包，运行时**不请求项目后端**。因此线上只需要 Caddy 托管静态文件，不需要任何 Node 进程。

后端（`apps/server`）目前只有 `/api/health`，**不对外暴露**。等阶段 5 接入 MirrorZ 后，再在同域加 `/api` 反向代理，避免现在就增加攻击面。

## 环境事实（2026-09-19 核实）

| 项         | 现状                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| DNS        | `mirror.campuslink.vip` → `109.94.171.216`（本机公网 IP，已就绪）                         |
| 服务器位置 | 德国法兰克福（xTom GmbH / Greencloud），**不属于中国大陆，无需 ICP 备案**                 |
| 80/443     | 由已在运行的 Caddy v2.11.4（systemd，用户 `caddy`）持有                                   |
| 现有站点   | `pi.campuslink.vip`（Authelia forward_auth + pi-web:30141），**本站改动不触碰它**         |
| TLS        | 已有 Let's Encrypt 证书目录 `acme-v02.api.letsencrypt.org-directory`，Caddy 自动签发/续期 |
| 构建产物   | `apps/web/dist`：JS 191 KB（gzip 69.95 KB）、CSS 17 KB（gzip 4.12 KB）、favicon 467 B     |

大陆访客的首屏延迟受这台海外机房限制；页面内的“响应耗时（估算）”是**访问者浏览器**发起的测量，与服务端位置无关。

## 发布步骤

```bash
# 1. 构建并同步产物到 /srv/mirror.campuslink.vip/current（需要 root）
sudo scripts/deploy-static.sh

# 2. 首次发布：把片段追加到 /etc/caddy/Caddyfile
cat deploy/Caddyfile.mirror >> /etc/caddy/Caddyfile

# 3. 以 caddy 用户校验（不要用 root validate，见下）
cp deploy/Caddyfile.mirror /tmp/check.caddy
sed -i 's#/var/log/caddy/mirror.log#/tmp/mirror-validate.log#' /tmp/check.caddy
su -s /bin/bash caddy -c 'caddy validate --config /tmp/check.caddy --adapter caddyfile'

# 4. reload（不中断 pi.campuslink.vip）
systemctl reload caddy

# 5. 本机验证
curl -sI https://mirror.campuslink.vip | head -3
curl -s https://mirror.campuslink.vip/ | head -5
```

**为什么必须用 caddy 用户校验**：`caddy validate` 会按配置预建日志文件。root 运行时生成 `/var/log/caddy/mirror.log`（root:root 0600），caddy 随后无法写入，服务起不来。这是 `pi.campuslink.vip` 维护记录里已有的坑。

**为什么部署要复制产物**：仓库在 `/root` 下，`caddy` 用户读不到；而且让 Web 服务器直接读工作区会把线上和开发耦合（构建中途、切分支、脏工作区都会影响访问）。

## 目录与回滚

```
/srv/mirror.campuslink.vip/
├── current/                 # Caddy 的 root（每次发布 rsync --delete 覆盖）
└── releases/<时间戳>/       # 硬链接快照，保留最近 5 份
```

回滚：

```bash
# 找到要回滚的时间戳
ls -1 /srv/mirror.campuslink.vip/releases
# 用快照覆盖 current
rm -rf /srv/mirror.campuslink.vip/current && cp -a /srv/mirror.campuslink.vip/releases/<时间戳> /srv/mirror.campuslink.vip/current
```

回滚不需要 reload Caddy：文件是原地替换，`file_server` 每次请求都读磁盘。

## 缓存策略

| 路径               | Cache-Control                         | 原因                                              |
| ------------------ | ------------------------------------- | ------------------------------------------------- |
| `/assets/*`        | `public, max-age=31536000, immutable` | 文件名含内容 hash，内容变化即换名                 |
| `/index.html`、`/` | `no-cache`                            | 必须每次校验，否则新版本发布的 asset 引用不会更新 |
| `/favicon.svg`     | `public, max-age=86400`               | 名字固定、内容几乎不变，1 天足够                  |

前端是 hash 路由，服务端只会收到 `/`，因此**不需要** `try_files` 回退规则（`PLAN.md` 6.3 要求选定一种路由方式并保持一致，这里选定 hash 模式）。

## 测速功能与 CSP

阶段 4 的探测由**访问者浏览器**直连镜像站，本站点目前不设置 CSP。若以后要加 CSP，`connect-src` 必须包含数据里声明的全部探针主机：

```
https://pypi.org https://registry.npmjs.org https://mirrors.tuna.tsinghua.edu.cn
https://mirrors.aliyun.com https://registry.npmmirror.com https://mirrors.tencent.com
```

漏掉任何一条都会让对应来源的测速静默失败（opaque 请求被 CSP 拦截时，界面只会显示“探测失败”）。新增镜像或更换探针地址时，这条清单要同步更新。

## 后端 API（阶段 5）

同步状态需要后端：`GET /api/mirrors` 返回各镜像×生态的上游同步状态，`GET /api/net-fingerprint` 返回网络指纹，`GET /api/health` 是健康检查。三者都带 `Cache-Control: no-store`。

### 运行形态

| 项   | 值                                                      | 理由                                                           |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------- |
| 服务 | systemd `mirrorn-api`（非 root 用户 `mirrorn`）         | 最小权限；仓库在 `/root` 下，服务不应该也不能读它              |
| 程序 | `/srv/mirrorn/api/server.js`（esbuild 单文件，~230 KB） | 不需要部署 `node_modules`，也不让服务依赖工作区                |
| 数据 | `/srv/mirrorn/api/data`（随部署复制）                   | 服务端按 `MIRRORN_DATA_DIR` 读取，与工作区解耦                 |
| 端口 | `127.0.0.1:8788`                                        | 生产与 dev 分离：dev 后端固定 8787，两者可同时运行             |
| 快照 | `/var/lib/mirrorn/mirrors-status.json`                  | 重启后先展示上次成功数据；systemd 以 `ReadWritePaths` 单独放行 |
| Node | `/usr/local/bin/node`（要求≥ 20）                       | 系统 `/usr/bin/node` 可能是 v12，跑打包产物会直接 SIGILL       |

环境文件是 `/etc/mirrorn/api.env`（`0640 root:mirrorn`，模板见 `deploy/api.env.example`）。部署脚本**不会覆盖已存在的环境文件**，因此改端口/改 secret 需要手动编辑该文件后重新运行 `sudo scripts/deploy-api.sh`。

### 反向代理（同域 /api）

```caddyfile
handle /api/* {
    reverse_proxy 127.0.0.1:8788
}
```

用 `handle` 而不是 `handle_path`：后端路由本身就带 `/api` 前缀。同域的好处是前端不需要 CORS 配置，后端也不需要发送 CORS 头。

**为什么生产后端不复用 8787**：dev 工作流把 8787 固定给开发后端（见 README 的端口规则）。两者用不同端口后，可以在本机边跑 `pnpm dev` 边让别人访问线上。反过来说，如果端口相同，部署脚本的端口预检会直接失败并输出占用者——这个预检是必要的：端口被别人占着时 `curl /api/health` 仍然会返回 200，那是别人的服务在应答（部署脚本曾经因此误判成功）。

### 运维命令

```bash
sudo scripts/deploy-api.sh                                       # 发布（打包 → 同步 → 重启 → 自检）
systemctl status mirrorn-api                                     # 运行状态
journalctl -u mirrorn-api -n 50 --no-pager                       # 日志（含每次同步的失败原因）
curl -s http://127.0.0.1:8788/api/mirrors | head -c 300          # 本机接口
curl -s https://mirror.campuslink.vip/api/mirrors | head -c 300  # 公网接口
sudo systemctl restart mirrorn-api                               # 强制重新同步（重启后会立即抓一次）
```

### 两个实测踩过的坑（已在脚本/单元里防住）

1. **Node 版本**：系统 `/usr/bin/node` 是 v12.22.9，运行打包产物直接 `SIGILL`（V8 snapshot 初始化失败）。单元里写死 `/usr/local/bin/node`，部署脚本会先校验 `>= 20` 才继续。
2. **`MemoryDenyWriteExecute=yes`**：这个 systemd 加固选项会让现代 Node 启动时 `V8_Fatal`（`v8::base::OS::SetPermissions`，`Check failed: 12 == errno`），因为 V8 的 JIT 需要可写可执行内存。单元里**刻意不开**它，其余加固项保留。

### 同步行为与上游边界

- 每 15 分钟抓一次（`MIRRORN_SYNC_INTERVAL_MS`），不重入；抓取超时 10 s、响应体上限 4 MiB。
- 只有**成功且校验通过**才替换内存数据；失败保留上一次成功值，超过 45 分钟未成功则把状态降级为 `unknown` 并返回 `stale: true`。
- 当前上游覆盖度：**只有清华 pip 有可核实的机器可读状态**（`static/tunasync.json`）。其余来源没有公开接口，界面显示“同步状态未知”；两个官方入口显示“官方源”。核实记录见 `docs/upstream.md`。
- 抓取的是第三方维护的静态文件：不转载上游原始数据，只保存归一化后的最小字段（状态、时间戳、上游地址、作业名）。

## 容器部署（`docker compose up --build`）

除了“Caddy + systemd 后端”的生产形态，仓库里还有一套单镜像部署，适合在别的机器上一键跑起来：

| 文件                 | 作用                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `Dockerfile`         | 多阶段构建：`node:22-slim` 里装依赖并构建前端与后端单文件；运行阶段只带 `server.js`、`data/`、静态产物 |
| `docker-compose.yml` | 一个服务、一个端口、一个数据卷；健康检查直接请求 `/api/health`                                         |
| `.env.example`       | 复制成 `.env` 后填写；`MIRRORN_FINGERPRINT_SECRET` 是唯一必须自己提供的值                              |
| `.dockerignore`      | 排除依赖、产物与本地状态（注意 `**/*.tsbuildinfo` 必须带 `**/`，否则嵌套的增量编译状态会被复制进去）   |

```bash
cp .env.example .env      # 填 MIRRORN_FINGERPRINT_SECRET
MIRRORN_PUBLISHED_PORT=8080 docker compose up --build -d
docker compose ps         # healthy 表示 /api/health 通过
docker compose down       # 停止，数据卷保留
```

这个镜像里**同一个进程既提供 `/api`，也托管前端静态页面**（服务端用 `MIRRORN_STATIC_DIR` 打开静态托管，缓存策略与 Caddy 一致：`/assets/` 长期缓存、其它 no-cache）。因此容器形态不需要 nginx，也不需要配置反向代理。

两个形态的关系：生产站点仍然是“Caddy 托管静态产物 + systemd 跑后端”（见上文），容器形态用于本机或别人的服务器上快速复现，两者共用同一份数据和构建配置。

`docs/validation-matrix.md` 记录了容器形态的实际执行结果（健康检查、静态回落、快照持久化）。

## 明确的边界

- **不暴露开发端口**：5173 / 5174 只绑 `127.0.0.1`，8787 同样。Caddy 只读磁盘上的静态产物，不反向代理任何开发服务器；`/api` 反代的是**生产**后端服务（systemd `mirrorn-api`，8788）。
- **后端对外只有 /api**：没有管理接口、没有写入接口；`/api/net-fingerprint` 不记录原始 IP，也不声称完全匿名（同网段共享同一指纹，这是设计目标）。
- **不影响 `pi.campuslink.vip`**：新站点是独立的 site block，不共用 Authelia，也不改现有安全头与日志配置。
- **不改 DNS、不改防火墙**：80/443 已在服务中，新子域沿用同一套。
