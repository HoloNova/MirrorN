# 部署：静态站点与后台资源索引

**状态**：当前实现已收敛为具体软件安装目录，发布核对见PLAN.md。升级必须先准备 `mirrorn-installers.sqlite`，保留现用 `mirrorn.sqlite` 及旧API至新库有有效下载；完整步骤见 [software-installer-catalog.md](software-installer-catalog.md)。用户已授权提交发布；开发阶段抓取数据不备份，切换后清除旧库/队列及抓取备份。以下早期静态预览、阶段5与全量包索引章节为历史运行记录，不是现行升级步骤。

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
| Node | `/usr/local/bin/node`（要求≥ 24）                       | 系统 `/usr/bin/node` 可能是 v12，跑打包产物会直接 SIGILL       |

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

1. **Node 版本**：系统 `/usr/bin/node` 是 v12.22.9，运行打包产物直接 `SIGILL`（V8 snapshot 初始化失败）。单元里写死 `/usr/local/bin/node`，部署脚本会先校验 `>= 24` 才继续。
2. **`MemoryDenyWriteExecute=yes`**：这个 systemd 加固选项会让现代 Node 启动时 `V8_Fatal`（`v8::base::OS::SetPermissions`，`Check failed: 12 == errno`），因为 V8 的 JIT 需要可写可执行内存。单元里**刻意不开**它，其余加固项保留。

### 资源目录与数据库

资源库是 `/var/lib/mirrorn/mirrorn.sqlite`（SQLite WAL，同目录有 `-wal` / `-shm`）；审核的站点、归类在 `/srv/mirrorn/api/data/`。新版发布脚本在替换程序前，用Node SQLite备份API取得包含WAL的一致性快照，并检查完整性；不能只复制主文件。当前文件索引版本的源站请求全部归后台任务，`browse/package`退出为410，前端只查有效文件批次。每次启动强制采集，之后每6小时调度；不检查过期后才启动，不爬包体。文件字节由源站直接提供，任务状态不展示给用户。

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

## BullMQ后台文件索引版（本地就绪，尚未发布）

运行目录改为 `/srv/mirrorn/api/dist/server.js` 与 `dist/index-worker.js`，同时带生产 `node_modules`、WASM解析资源和 `data/`；不能只复制一个JS文件。`scripts/prepare-api-runtime.sh <空目录>` 生成独立候选，`scripts/deploy-api.sh` 才负责系统服务切换；本轮未执行后者。

队列需要Redis >=6.2，开启AOF、`maxmemory-policy noeviction`，只在本地/内部网络访问；默认URL为 `redis://127.0.0.1:6389/0`，通过 `/etc/mirrorn/api.env` 的 `MIRRORN_REDIS_URL` 覆盖。Debian当前软件源6.0不符合最低要求，不直接使用。`scripts/check-index-redis.mjs <运行目录>` 检查版本、AOF和淘汰策略；检查失败在替换生产程序前退出。Redis不代替SQLite业务库。

`MIRRORN_CRAWL_ENABLED=true` 默认开启北大后台任务；关闭可暂停采集但继续读有效数据库。`MIRRORN_CRAWL_TIMEOUT_MS=30000` 限制连接/网络读等待，不把解析与Redis分批入队耗时当网络超时。Redis不可用时采集等待恢复，API仍读SQLite；systemd线程随API进程一起停止，不另起采集服务。

容器配置已加入内部Redis、AOF持久卷，不暴露Redis宿主机端口；业务数据库使用独立卷。此轮只核对配置，不运行Docker全量构建/启动。临时Node进程和隔离测试Redis结束即停止。

发布须另获确认，先备份SQLite、准备Redis，再切后端与配套静态产物。首轮全量范围/耗时/占用由后台记录，不因API健康200就宣称北大40个仓库全部采集完成。Web界面只由用户在公网人工验收。

### 本机Redis安装（发布准备）

使用单独的 `mirrorn-redis` 用户。将核验过的Redis >=6.2二进制安装到 `/usr/local/lib/mirrorn-redis/redis-server`（CLI同目录），复制 `deploy/mirrorn-redis.conf` 到 `/etc/mirrorn/redis.conf`，数据目录 `/var/lib/mirrorn-redis` 归该用户，安装 `deploy/mirrorn-redis.service` 后启动/启用服务。本次候选为已编译验证的Redis 8.10.2，不使用系统软件源的6.0；本机仅监听127.0.0.1:6389，AOF/everysec、768MiB/noeviction。SQLite仍是业务权威库。

后台每次执行任务前检查数据库所在文件系统剩余空间。低于2GiB时用BullMQ原生RateLimitError延后待办、每分钟重查；不消耗任务重试次数、不删除有效数据，也不截断采集范围。腾出空间后自动继续。API查询不受暂停采集影响。

### 本轮生产运行补充（2026-10-01/02）

已安装独立 `mirrorn-redis` 服务，程序 `/usr/local/lib/mirrorn-redis/redis-server`，监听 `127.0.0.1:6389`，AOF/noeviction，数据 `/var/lib/mirrorn-redis/`。它仅保存采集任务，文件和项目入口仍在SQLite；使用该端口不会替换系统其它Redis实例。Redis版本、持久化配置由发布脚本预检。

采集默认在可用磁盘不足2GiB时暂停，保留待办和有效数据；不得为“显示完成”而清空待办。首轮未采齐，当前空间不适合直接承诺全库完成。PyPI项目清单持久化SQLite并按小窗口派发，读取API不消费待办、不请求源站。

SQLite备份如需节省空间，完成完整性检查后可压缩为同名`.sqlite.gz`，再运行`gzip -t`核验；恢复时先解压，不把压缩文件直接交给SQLite。不能只备份WAL模式的主文件。当前静态快照 `20261001-201932`，API与采集线程在 `/srv/mirrorn/api/dist/`。

## 安装目录的切换

不要直接重启新程序：它使用独立的 `mirrorn-installers.sqlite`。先按 `docs/software-installer-catalog.md` 显式执行后台准备脚本；现用包库与旧API不动。部署脚本检查Node.js、Miniconda、Anaconda、R均已存在有效安装下载，未准备好就拒绝替换运行目录。准备完成后直接切换API/静态站，不备份可重新采集的数据；启动线程仍强制执行完整新轮次，不因准备数据未过期而跳过。

新队列名 `mirrorn-pku-installers-v2` 与旧 `mirrorn-pku-index` 隔离。新API `/api/resources` 带 `catalog: installers-v2`；搜索只显示实际已有安装下载的软件。验证公网搜索、版本/平台筛选和文件直链，再按人工清单验收。旧Node/Miniconda路由身份保留，旧发行版仓库下载页退出。

新API核对通过后用 `scripts/retire-package-index.mjs /srv/mirrorn/api /var/lib/mirrorn --apply` 退役旧包库/WAL/SHM、旧队列、旧目录缓存及按固定命名识别的抓取备份。默认只读输出计划；--apply在确认新API及新库可用后直接清除，不创建抓取数据备份。保留当前安装目录与既有测速信息，不删除数据库容器/卷。

## 当前规则系统发布（2026-10-03）

功能 `93021af` 与启动修正 `1b9d341` 已部署，静态快照 `20261003-123620`。实际公开入口核对见 `docs/download-rule-system-design.md` 第 12 节。生产数据沿用 `mirrorn-installers.sqlite`，不复制／备份抓取数据，软件规则与 `data/software.json` 由运行目录准备脚本一并复制到 `/srv/mirrorn/api/data/`。规则无独立更新接口，不可单独覆盖 JSON 充当热更新。

当前 BullMQ 命名空间为 `mirrorn-pku-download-rules-v3`；任务包含配置和执行代码摘要。部署后的旧摘要任务已失效，只能按版本匹配清理待办，不得批量移除当前版本任务或下载数据。启动强制刷新保留；首次定时刷新设置未来 startDate，避免 BullMQ 默认立即触发与启动刷新重复。Redis／源站失联或规则加载失败不让读取接口联网兜底。

部署使用 `scripts/deploy-api.sh`、`scripts/deploy-static.sh`，构建命令放入一次性 systemd 单元限制 CPU、总内存和运行时间；不把 Node 堆限制当作进程组限制，也不改变生产服务限额。UI 仍按 `docs/acceptance-checklist.md` 由用户手动验收。
