# MirrorN

MirrorN 是面向初学者与开发者的智能镜像导航和开发环境配置平台。当前已完成阶段 1–6：数据层与工程骨架、四步配置向导、前端搜索、浏览器端测速与推荐、后端同步状态与网络指纹、apt 与 Docker 生态补齐和首版发布（静态站点 + 后端 API + 容器镜像）。资源中心与 LLM 属于首版之后的内容，见 `PLAN.md`。

## 本地启动

要求：Node.js `>=20.19.0`、pnpm `12`。

```bash
pnpm install
pnpm dev
```

- 前端：<http://127.0.0.1:5173>
- 后端健康检查：<http://127.0.0.1:8787/api/health>

只启动前端：

```bash
pnpm dev:web
```

只启动后端：

```bash
pnpm dev:server
```

端口规则：

- 后端在 dev 下固定为 `8787`（`apps/server` 的 `dev` 脚本里显式写了 `--port 8787`），**不受 shell 里 `PORT` 的影响**，原因见下面的“为什么 dev 固定后端端口”。
- dev 系列脚本会先做**端口预检**（`scripts/require-free-port.mjs`）：5173 或 8787 被占用就立即退出。这不是只想给个好提示，而是为了避免一个已实测的坑：Vite 的依赖预打包发生在**绑定端口之前**，第二个实例即使随后启动失败，也已经重建了共享缓存，会把正在浏览的页面打断。
- 前端端口可用 `MIRRORN_WEB_PORT` 覆盖：`MIRRORN_WEB_PORT=5174 pnpm dev`（预检会跟着检查同一个端口）。这个开关主要是给“某个端口在你那一侧打不开”的情况用的，见下面“页面白屏或一直转圈的排查顺序”。
- 需要换后端端口：`pnpm --filter @mirrorn/server dev -- --port 9000`（后出现的 `--port` 生效；预检仍检查 8787，请把新端口作为参数传给 `scripts/require-free-port.mjs`）。
- 部署产物没有 `--port` 时按 `MIRRORN_PORT` → `PORT` → `8787` 依次解析：项目专用变量优先，平台注入的 `PORT` 仍然可用。
- 后端默认**只绑 `127.0.0.1`**（`MIRRORN_HOST` 可改）：对外一律通过同机反向代理，不直接暴露开发进程；需要容器部署时再显式设 `MIRRORN_HOST=0.0.0.0`。

说明：

- **前端是否需要后端是可配置的**：镜像、生态与排错数据永远随前端包一同构建（纯静态也能完整用向导与测速）；只有**上游同步状态**需要后端。构建期变量 `VITE_API_BASE` 决定这件事：
  - 未设置（生产默认）：纯静态模式，**不会发任何请求**，来源行显示“同步状态未知”；
  - 设为 `/`：同源 `/api`（公开部署就是这样，由 Caddy 反代到本机后端）；
  - 设为完整地址：跨域使用时需要后端自己处理 CORS（当前后端不发送 CORS 头，因此不推荐）。
    开发模式（`pnpm dev`）默认按 `/` 处理，vite dev server 会把 `/api` 代理到本地后端；后端没启动时请求快速失败并降级，不影响页面。
- 后端环境变量（都有安全默认值）：`MIRRORN_HOST`、`MIRRORN_PORT`、`MIRRORN_DATA_DIR`、`MIRRORN_SNAPSHOT_DIR`、`MIRRORN_SYNC_ENABLED`、`MIRRORN_SYNC_INTERVAL_MS`、`MIRRORN_SYNC_STALE_AFTER_MS`、`MIRRORN_FETCH_TIMEOUT_MS`、`MIRRORN_MAX_RESPONSE_BYTES`、`MIRRORN_TRUSTED_PROXY`（默认 `false`）、`MIRRORN_FINGERPRINT_SECRET`（不配置就不提供指纹）。含义与理由见 `docs/deployment.md`。
- `pnpm dev`、`pnpm dev:web`、`pnpm build` 和 `pnpm build:web` 都会先执行数据校验，避免未校验的数据进入页面。
- 后端崩溃不会再连带结束前端 dev server（这样页面仍然可用，报错也看得见）；按 Ctrl+C 两者一起退出。
- **同一时间只跑一个 vite dev server**：多个实例共用 `apps/web/node_modules/.vite` 依赖预打包缓存，后启动的实例重建缓存时会让已打开的页面加载失败（表现为白屏或一直转圈）。端口预检会在碰到缓存之前就把这种情况挡住；e2e 用自己的缓存目录（`node_modules/.vite-e2e`），与 dev 完全隔离。

### 为什么 dev 固定后端端口

`PORT` 是通用环境变量，同机上的其他工具经常占用它，而 `pnpm dev` 会继承 shell 环境。曾经的坑：后端去绑那个被占用的端口、报 `EADDRINUSE` 退出，而脚本里的 `concurrently --kill-others-on-fail` 顺手把前端也结束了 —— 浏览器白屏、终端里只有一段栈。现在后端端口由 dev 脚本固定，端口被占时打印可照做的提示并退出，前端继续服务；vite 也改成 `strictPort`，端口被占时直接报错，而不是静默改用 5174（那会让“终端显示的端口”和“你以为在看的页面”不一致）。

### 页面白屏或一直转圈的排查顺序

1. **看浏览器 DevTools Console，而不是终端**。这类故障常常在终端里完全无报错：
   - 出现 `TypeError: … is not a function` 一类报错：某个浏览器 API 在当前浏览器里只有部分实现（例如 `navigator.connection` 没有 `addEventListener`）。
   - Network 里依赖文件（`/node_modules/.vite/deps/…`）返回 **504**：依赖预打包缓存被另一个进程重建过，见第 3 条。
2. 终端是否出现“端口 … 已被占用”：上一次的 dev 进程还在，或端口预检把第二次启动拦下来了。
3. 终端是否出现 `Port 5173 is already in use` 或依赖文件 504：同时跑了两个 vite 实例，缓存被重建。**重启 dev server**（`Ctrl+C` 后重新 `pnpm dev`）即可恢复。
4. 直接双击打开构建产物 `dist/index.html`（`file://`）也会白屏：产物用绝对路径 `/assets/…`，必须用静态 HTTP 服务打开。
5. **只有某个端口打不开**（例如 5173 不行、5174 可以）：服务端本身没问题（用 `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/` 可以验证），问题在“浏览器到这个端口”这一段。依次试：
   - 换一种主机名写法：`http://localhost:5173/` 与 `http://127.0.0.1:5173/` 是**不同 origin**，按 origin 缓存的 Service Worker、站点数据、HSTS 只影响其中一个。
   - 用无痕窗口打开同一 URL：排除扩展与缓存。
   - 用 VS Code 的“Simple Browser: Show”（命令面板）打开：完全绕过你自己的浏览器。
   - 看 VS Code 的 **Ports 面板**：对应端口那一行的转发状态是否正常；残留的旧转发条目可以删掉重建。
   - 确认本机没有别的进程占着这个端口（Windows `netstat -ano | findstr :5173`，macOS `lsof -i :5173`）。
   - 以上都不方便查时，直接用另一个端口：`MIRRORN_WEB_PORT=5174 pnpm dev`。

## 公开部署（静态预览版 + 同域 API）

前端是纯静态站点（hash 路由 + 数据随包构建），线上只需要 Caddy 托管产物；同步状态由同域 `/api` 反代到本机后端服务提供，后端起不来时页面仍完整可用（只是状态显示“未知”）。

```bash
sudo scripts/deploy-static.sh   # 构建（VITE_API_BASE=/）并同步到 /srv/mirror.campuslink.vip/current
sudo scripts/deploy-api.sh      # 打包后端、安装/重启 systemd 服务 mirrorn-api（监听 127.0.0.1:8788）
```

站点配置片段在 `deploy/Caddyfile.mirror`（`/api` → `127.0.0.1:8788`，其余走 `file_server`），后端单元在 `deploy/mirrorn-api.service`，环境文件模板在 `deploy/api.env.example`。完整步骤、回滚方式、缓存策略、CSP/connect-src 注意事项、Node 版本与内存保护选项的坑，见 `docs/deployment.md`。开发端口（5173/5174/8787）只绑 `127.0.0.1`，不对外暴露，也不反向代理任何开发服务器。

## 容器部署

同机不想装 Caddy / systemd，或者想在别的机器上一键跑起来时用容器（单镜像里同时提供 API 与静态页面）：

```bash
cp .env.example .env                          # 填 MIRRORN_FINGERPRINT_SECRET
MIRRORN_PUBLISHED_PORT=8080 docker compose up --build -d
docker compose ps                             # healthy = /api/health 通过
```

快照存在 named volume 里（重启后先展示上一次成功的同步状态），`docker compose down` 不会删数据。细节与实测记录见 `docs/deployment.md`、`docs/validation-matrix.md`。

## 手动验收

启动 `pnpm dev:web` 后，按下面顺序检查（括号内是预期结果）：

1. 打开 <http://127.0.0.1:5173>（大搜索框居中，下方是 npm 与 pip 两张生态卡片）。
2. 按 `/` 键（焦点进入搜索框），输入 `tuna`（出现清华大学镜像站结果；按 Enter 展开它支持的生态入口）。
3. 输入 `pip` 后按回车（进入 pip 向导，显示前置条件与四个步骤）。
4. 切成 `Linux` 与 `Bash`，点“下一步”（列出官方、清华、阿里云三个来源，每个来源带一行测量状态：先是“测试中”，随后变成“响应耗时（估算） … ms · 响应完成，内容未验证”）。
5. 等三项都测完（数据里没有探针的来源会显示“无法测量”）：最快的一项带“推荐”标记并被默认选中；如果手动点过别的来源，之后重新测量不会替换它，并会提示这一点。
6. 点“重新测量”（重新发起一轮测量，时间戳更新；浏览器报告离线时按钮不可用）。
7. 点“清华大学”（命令变为 `python3 -m pip install --index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/ <包名>`）。
8. 依次查看“全局生效”和“配置文件”（前者是 `pip config set`，后者给出 `~/.config/pip/pip.conf` 并提示合并而不是覆盖）。
9. 点两次“下一步”到步骤 3 与 4（分别给出验证命令与还原命令，并说明页面不会执行命令）。
10. 回到首页搜 `tuna`（镜像结果右侧出现 `≈ … ms`，来自刚才向导里的缓存值；搜索本身不发起任何请求）。
11. 展开底部排错卡片（每条带来源链接与核对日期）。
12. 回到首页搜 `ubuntu`，进入 `Ubuntu / apt`：步骤 1 多出“发行版版本”，选 `24.04` 后步骤 2 的配置文件是 deb822（`/etc/apt/sources.list.d/ubuntu.sources`，`Types:`/`URIs:`/`Suites:`），选 `22.04` 变成 `sources.list` 一行式；两种情况下 `-security` 都指向官方 `security.ubuntu.com`。
13. 搜 `docker`：`Docker CE / apt 仓库` 给的是 `/etc/apt/sources.list.d/docker.sources`；`Docker Hub / 镜像加速` 给的是 `daemon.json` 的**合并**命令（含备份与还原），并且不含任何写死的加速地址。

浏览器控制台应当没有错误。测量数字只表示“浏览器请求来源站上审核过的小资源所用的时间”，受 DNS、连接复用和缓存影响，不是下载速度，也不能证明仓库内容正常。当前尚未实现的部分：资源中心与 LLM（首版之后）。

## 质量检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:data
pnpm build
pnpm test:e2e
```

`pnpm test` 是各包的单元测试；`pnpm test:e2e` 需要系统已安装 Chrome，会先做数据校验再启动开发服务器。

CI（`.github/workflows/ci.yml`）会依次跑格式检查、lint、类型检查、数据校验、单元测试、构建与 E2E，并在另一个 job 里执行 `docker compose up --build` 与健康检查。模板生成的命令在真实环境里的执行记录（apt、Docker、pip、npm）以及**尚未覆盖的缺口**见 `docs/validation-matrix.md`。

`pnpm validate:data` 会校验 `data/` 下的 JSON、镜像与生态引用、HTTPS 地址以及命令模板变量；数据目录为空、引用了不存在的镜像，或某个生态没有排错条目时都会以非零状态退出。

## 页面结构

- `/#/`：生态目录与搜索框：`/` 或 Ctrl/Cmd+K 唤起，上下键选择，Enter 确认，Esc 清空。
- `/#/ecosystems/:id`：该生态的四步配置向导（系统与终端 → 镜像与配置方式 → 验证 → 恢复与还原），下方附排错卡片。
- 其他路径：未找到页面。

阶段 2 已完成：向导只展示仓库中审核过的模板，命令由 `@mirrorn/shared/generators` 渲染，页面不会执行任何命令，也不会读取或写入你的配置。

当前收录 5 个生态：`pip`、`npm`、`apt`（Ubuntu LTS）、`docker-ce`（Docker CE 软件仓库）、`dockerhub`（Docker Hub 加速配置）。apt 与 Docker CE 按 Ubuntu 版本区分配置格式，Docker Hub 加速只提供合并/验证/还原方式，不内置第三方加速地址（理由见 `docs/decisions.md`）。

阶段 3 已完成：搜索完全在浏览器内存中进行，不请求后端；支持 `/` 与 Ctrl/Cmd+K 唤起、上下键选择、Enter 确认、Esc 清空，输入法组词期间不误触发导航。结果上限 8 条，镜像结果会直接给出该站支持的生态入口。

## 设计约束

前端不引入 zod：`data/` 的 JSON 在构建时就已经过 schema 校验，浏览器只消费结果。因此 `apps/web` 只从 `packages/shared` 取类型，不取运行时 schema；作为代价，`pnpm validate:data` 是构建的前提而不是可选项。测速用的类型与常量放在同样零运行时依赖的 `@mirrorn/shared/probe` 子路径里，所以浏览器产物里同样不含 zod。取舍依据和实测体积见 `docs/decisions.md`。

## 目录

- `apps/web`：Vue 3 + Vite 前端，包含首页搜索、四步配置向导，以及浏览器端测速与推荐（`src/lib/probe*.ts`、`src/lib/recommend.ts`、`src/composables/useMirrorProbes.ts`）。
- `apps/server`：Node.js + Hono 后端：健康检查、上游同步状态聚合（`/api/mirrors`）、网络指纹（`/api/net-fingerprint`），可选同时托管前端产物（`MIRRORN_STATIC_DIR`）。
- `packages/shared`：Zod schema、共享类型、数据集校验函数，以及零运行时依赖的命令生成器（`@mirrorn/shared/generators`）、测速契约（`@mirrorn/shared/probe`）和同步状态契约（`@mirrorn/shared/sync`）。
- `data`：声明式镜像、生态与排错数据；镜像的 `aliases` 与生态的 `aliases` 供搜索使用，镜像的 `probe` 供测速使用，社区 PR 可直接扩充。
- `docs`：上游来源记录（`upstream.md`）、命令核对记录（`command-validation.md`）、探针实测记录（`probe-validation.md`）、真实执行记录与缺口（`validation-matrix.md`）、部署与回滚（`deployment.md`）、许可与署名（`licenses.md`）和架构取舍（`decisions.md`）。
- `deploy`：公开部署用的 Caddy 站点配置片段、systemd 单元与后端环境模板（配合 `scripts/deploy-static.sh`、`scripts/deploy-api.sh`，见 `docs/deployment.md`）。
- `Dockerfile` / `docker-compose.yml`：容器部署（单镜像同时提供 API 与静态页面，见上文与 `docs/validation-matrix.md`）。
- `.github/workflows/ci.yml`：CI 质量门禁与容器部署校验。
- `e2e`：Playwright 端到端测试，覆盖键盘搜索流程、动效降级、窄屏布局、测速与推荐、同步状态降级、apt 版本切换与 Docker 两项配置；使用系统已安装的 Chrome，不额外下载浏览器。
- `MAIN.md`：完整产品与技术规划。
- `PLAN.md`：分阶段实施计划。

贡献方式（新增镜像、生态、排错卡片的最小示例与必跑命令）见 `CONTRIBUTING.md`；数据来源与命令核对边界见 `docs/upstream.md` 与 `docs/command-validation.md`，第三方许可与署名见 `docs/licenses.md`。
