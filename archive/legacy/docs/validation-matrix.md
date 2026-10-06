# 真实环境执行记录（阶段 6.2）

本文只记录**实际执行过**的命令与观察到的输出，不写推断结论。未执行的项目在最后一节明确列出。

执行环境：本机 VPS（Debian，Docker 29.8.1 + Compose v5.5.1），容器为官方 `ubuntu:24.04`、`ubuntu:22.04`、`ubuntu:20.04`、`python:3.11-slim`、`node:22-slim`。
执行日期：2026-09-19。
被验证的内容一律**从仓库数据文件渲染**（把 `{{mirrorUrl}}` 替换成数据里声明的地址），确保验证的就是页面输出的那份文本，而不是另写一份。

## 一、apt（Ubuntu LTS）

### 1.1 配置文件内容是否可用

| 版本                         | 渲染来源                                                                    | 镜像 | 观察到的结果                                                                                                                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24.04（noble，deb822）       | `data/ecosystems/apt.json` → `apt-ubuntu-2404-bash` 的 `configFile.content` | 清华 | `apt-get update` 0 报错；`Get:2-4` 来自 `mirrors.tuna.tsinghua.edu.cn/ubuntu`（noble / -updates / -backports），`Hit:1` 来自 `security.ubuntu.com`；`apt-get --print-uris -y install hello` 输出 `https://mirrors.tuna.tsinghua.edu.cn/ubuntu/pool/main/h/hello/hello_2.10-3build1_amd64.deb` |
| 22.04（jammy，sources.list） | 同上，`apt-ubuntu-2204-bash`                                                | 清华 | `apt-get update` 0 报错，索引来自镜像、security 来自官方；`hello_2.10-2ubuntu4_amd64.deb` 的下载地址是镜像地址                                                                                                                                                                                |
| 20.04（focal，sources.list） | 同上，`apt-ubuntu-2004-bash`                                                | 清华 | `apt-get update` 0 报错；3 条索引来自镜像；`hello_2.10-2ubuntu2_amd64.deb` 的下载地址是镜像地址                                                                                                                                                                                               |

### 1.2 持久化 sed 命令是否只改该改的行

| 版本  | 命令来源                                                                                    | 结果                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24.04 | `apt-ubuntu-2404-bash` 的 `persistent.command`（容器内以 root 执行原命令，已先安装 `sudo`） | 退出码 0；归档段落的 `URIs:` 变成镜像地址，security 段落的 `URIs:` 仍是官方 `http://security.ubuntu.com/ubuntu/`；`apt-get update` 0 报错；`hello` 的下载地址是镜像地址 |
| 22.04 | `apt-ubuntu-2204-bash` 的 `persistent.command`                                              | 退出码 0；所有**不带** `-security` 的 `deb` 行改成镜像，三条 `jammy-security` 行保持官方地址；`apt-get update` 0 报错；`hello` 的下载地址是镜像地址                     |

### 1.3 执行中发现并已处理的问题

- **最小化系统缺少 ca-certificates**：直接使用官方 `ubuntu:24.04` / `ubuntu:22.04` 镜像（默认没有 `ca-certificates`）时，HTTPS 源会报
  `Certificate verification failed: The certificate issuer is unknown`。
  这是容器/云镜像的常见状态，不是配置写错。处理：`apt` 的前置条件里加了引导步骤（先用系统自带的 http 源安装 `ca-certificates`），并在排错库里新增 `apt-ca-certificates-missing` 卡片；`docker-ce` 的前置条件也同样提示。
  之后的验证都是先按这个引导步骤装好证书再执行，结果如上表。

## 二、Docker

### 2.1 Docker CE 软件仓库（Ubuntu 24.04）

命令来源：`data/ecosystems/docker-ce.json` → `docker-ce-ubuntu-2404-bash`。

- GPG 公钥：`curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg` 成功，文件 2760 字节。
- 写入镜像仓库文件后 `apt-get update`：`Get:5 https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/ubuntu noble InRelease`、`Get:6 .../noble/stable amd64 Packages`。
- `apt-get --print-uris -y install docker-ce`：下载地址为 `https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/ubuntu/dists/noble/pool/stable/amd64/docker-ce-cli_29.8.1-1~ubuntu.24.04~noble_amd64.deb`（同为镜像地址）。
- `apt-cache madison docker-ce`：来源列显示 `https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/ubuntu noble/stable amd64 Packages`（这正是向导里给出的验证命令）。

### 2.2 Docker Hub 加速的 daemon.json 合并

命令来源：`data/ecosystems/dockerhub.json` → `dockerhub-linux-bash`。

| 场景                                            | 结果                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 没有安装 python3                                | 命令打印“缺少 python3：请先安装…或用编辑器手动合并”，退出码 1，`/etc/docker/daemon.json` **保持原样**（未被破坏）         |
| 已安装 python3，原有 `log-driver` / `data-root` | 合并后三个键共存（`log-driver`、`data-root`、`registry-mirrors`），备份文件 `/etc/docker/daemon.json.mirrorn.bak` 66 字节 |
| 还原命令                                        | `registry-mirrors` 被移除，`log-driver` 与 `data-root` 保留                                                               |

## 三、pip 与 npm（Linux / Bash）

命令来源：`data/ecosystems/pip.json` → `pip-linux-bash`、`data/ecosystems/npm.json` → `npm-linux-bash`。

### 3.1 pip（python:3.11-slim，镜像 aliyun）

- 临时使用：`python3 -m pip install --index-url https://mirrors.aliyun.com/pypi/simple/ six` → 输出 `Looking in indexes: https://mirrors.aliyun.com/pypi/simple/`、`Downloading https://mirrors.aliyun.com/pypi/packages/…/six-1.17.0-py2.py3-none-any.whl`、`Successfully installed six-1.17.0`。
- 持久化：`pip config set global.index-url …` 写入 `/root/.config/pip/pip.conf`。
- 验证：`pip config get global.index-url` → `https://mirrors.aliyun.com/pypi/simple/`。
- 还原：`pip config unset global.index-url` 后 `pip config get` 报 `No such key`，说明配置已移除（该报错是预期结果）。

### 3.2 npm（node:22-slim，镜像 npmmirror）

- 临时使用：`npm install --registry https://registry.npmmirror.com/ left-pad` → `added 1 package`；`package-lock.json` 里的 tarball 地址是 `https://registry.npmmirror.com/left-pad/-/left-pad-1.3.0.tgz`。
- 持久化 + 验证：`npm config set registry …` 后 `npm config get registry` → `https://registry.npmmirror.com/`。
- 还原：`npm config delete registry` 后 `npm config get registry` → `https://registry.npmjs.org/`。

## 四、界面（浏览器）

界面行为**不做自动化测试**（决定与原因见 `docs/decisions.md` 的「界面行为改为人工验收」），由人工在浏览器里按
`docs/acceptance-checklist.md` 核对。这份清单覆盖 PLAN 6.2 要求的内容：

| 要求             | 清单里的检查点                                   |
| ---------------- | ------------------------------------------------ |
| 搜索             | 第 14 项（键盘唤起、上下键、回车、Esc、输入法）  |
| 生态文档         | 第 5–13 项（参数联动、命令改写、复制、还原提示） |
| 手动选源不被覆盖 | 第 8 项（选过之后测量不替换选择）                |
| API 离线降级     | 第 17 项之下的“关键回归点”一节                   |
| 探测失败         | 第 9 项（超时/失败/无法测量不画刻度）            |

## 五、没有执行的项目（缺口）

以下项目在本机环境无法执行，明确保留为缺口，不当作已通过：

1. **Windows（PowerShell / CMD）与 macOS（bash）**：没有对应的机器或容器。这两个平台的模板只经过数据校验与单元测试，没有真实执行证据。
2. **zsh**：数据里没有 zsh 模板（pip/npm/apt 都只提供 bash），因此不存在 zsh 的执行证据。
3. **arm64 等非 x86 架构**：只核对了 `ports.ubuntu.com/ubuntu-ports` 与清华 `ubuntu-ports` 的 `dists/noble/Release` 返回 200，没有在 arm64 机器上执行配置。
4. **apt 的完整升级流程**：只验证了 `apt-get update` 与 `--print-uris`（不真正下载安装），没有执行 `apt-get upgrade`/`dist-upgrade`。
5. **Docker 守护进程本身**：容器里无法运行 systemd 服务，因此“安装后 docker 能否正常启动并运行容器”“registry-mirrors 是否真的加速了拉取”都没有验证。`docker-ce` 只验证到软件包来源正确，`dockerhub` 只验证到 daemon.json 的合并与还原正确。
6. **真实加速地址**：本向导不提供任何第三方加速地址，`registry-mirrors` 的实际加速效果无法（也不应该）由我们验证。
7. **容器里只有“软件包来源正确”，没有守护进程**：与第 5 条同因。

## 六、容器部署（`docker compose up --build`）

按 PLAN 6.3 的验收要求实际执行过（本机 Docker 29.8.1 / Compose v5.5.1，端口映射 8899）：

```bash
MIRRORN_PUBLISHED_PORT=8899 MIRRORN_FINGERPRINT_SECRET=… docker compose up --build -d
```

观察到：

- 构建成功（多阶段：`node:22-slim` 里装依赖 → `VITE_API_BASE=/ pnpm build:web` → esbuild 打后端单文件；运行阶段只带 `server.js`、`data/`、静态产物）。
- 启动后 **约 5 秒内变为 healthy**（健康检查用 `node -e` 直接请求 `/api/health`，镜像里没有 curl）。
- 接口：`/api/health` 返回 `{"status":"ok",…}`；`/api/mirrors` 返回真实的清华同步状态（`stale: false`）；`/api/net-fingerprint` 因为传了 secret 而 `available: true`。
- 静态页面：`/` → 200；`/ecosystems/apt`（hash 路由下不存在的真实路径）→ 200（回落到 index.html）；`/assets/index-*.js` → 200 且 `cache-control: public, max-age=31536000, immutable`、`x-frame-options: DENY`。
- 快照持久化：卷里出现 `/var/lib/mirrorn/mirrors-status.json`（属主 UID 10001）；`docker compose restart` 后日志打印「同步：已载入上次成功快照」，接口继续可用。
- 验证完成后已 `docker compose down`（保留数据卷）。

构建过程中修掉的问题（值得记录）：`.dockerignore` 里写 `*.tsbuildinfo` **只匹配根目录**，嵌套的 `packages/shared/tsconfig.build.tsbuildinfo` 仍会被复制进上下文，于是 `tsc` 认为“没有变化”而跳过 emit，导致 `@mirrorn/shared` 的 `dist` 缺失、构建失败。改成 `**/*.tsbuildinfo` 后正常（`.gitignore` 里本来就排除了这些文件，只有手工 rsync/构建上下文才会带上）。
