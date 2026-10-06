# MirrorN

MirrorN 帮助初学者查找软件在 Windows、macOS、Linux 上的安装器／预编译包和系统安装镜像：搜索软件或生态，选择版本、系统和架构，从镜像站文件直链下载。教程当前占位。本站不下载安装包、不代理包体，不执行修改用户本机配置的命令。

**当前开发版**沿用“通用目录模板＋软件特性＋站点绑定”采集安装器、运行包和系统 ISO，不整库采集发行版／语言依赖。北大JSON与清华HTML目录共用采集链路；清华首批仅Node.js、Miniconda、Anaconda、Ubuntu安装镜像，中科大因本轮直接GET403不启用，见 [`docs/multisite-catalog-design.md`](docs/multisite-catalog-design.md)。规则随源码发布，不开放修改接口或热更新；版本、文件名和链接由后台动态发现。生态收录与是否已有下载分开，未知文件保留待核对样本。基础规则见 [`docs/download-rule-system-design.md`](docs/download-rule-system-design.md)。**完整覆盖仍在推进，实际挂载与采集进度见 `PLAN.md`。**

首页仅按需搜索生态／软件，同一软件合并不同站点。站点列表点击后每页10条、滚动续页；软件页自动选站，进入后直接展示并请求首批下载文件，历史版本单独按需查询。“节省代理流量”只保留已核实的中国大陆入口，不代表网页能关闭系统代理。设计与接口见 [`docs/lazy-catalog-design.md`](docs/lazy-catalog-design.md)。

## 开发

要求 Node.js 24+、pnpm 12、Redis 6.2+。SQLite来自Node内置 `node:sqlite`，不需要数据库容器。Redis只保存BullMQ后台待办；Redis失联不阻止读取已有安装下载。

```bash
pnpm install
pnpm dev
```

前端 <http://127.0.0.1:5173/>，后端 <http://127.0.0.1:8787/api/health>。页面资源需要后端，通过同源 `/api` 查询；仅启动前端不能浏览下载。离开会话请停止临时进程。后端 `MIRRORN_*` 配置见 [`docs/deployment.md`](docs/deployment.md)；测速按既有访客浏览器规则工作，不属于后台采集。

## 数据链路与代码

**后台启动强制刷新／每六小时采集 → 用途识别 → 暂存完整校验 → SQLite事务更新 → 查询API → 下载直链。** 请求源站仅限后台任务、测速及用户点击实际下载；搜索、分页、筛选均不联网补数据。

| 位置                                               | 职责                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| `data/mirrors.json`                                | 审核站点身份与既有测速信息，不是文件清单               |
| `data/software.json`、`data/download-rules/`       | 软件身份、模板、特性规则与审核过的站点入口             |
| `apps/server/src/indexing/rules/`、`installers.ts` | 规则加载／判断／清洗、有限未知样本及后台发现           |
| `apps/server/src/indexing/source.ts`、`queue.ts`   | 受限元数据HTTP、BullMQ/Redis调度及重试                 |
| `apps/server/src/db/installers.ts`                 | 四类业务实体、短暂暂存、安全更新；相同URL原位更新      |
| `apps/server/src/db/catalog.ts`、`fileQueries.ts`  | 软件/版本/站点关系和只读文件查询，不扫描全体依赖包名字 |
| `apps/web/src/lib/resourceApi.ts`                  | 页面统一读API；跨更新分页自动重新读取首屏              |
| `data/tutorials.json`、`apps/web/src/tutorials/`   | 教程关联及旧正文素材；当前只占位                       |

新库为 `MIRRORN_SNAPSHOT_DIR/mirrorn-installers.sqlite`；旧 `mirrorn.sqlite`不自动导入、删除或复用。旧包采集器、PyPI批量包页队列及复制整批文件的快照实现已退役。旧 `data/site-inventories/` / `site-resources/` 是官方仓库归档，不能等同于当前有下载的软件条目。旧换源模板在共享包保留，但不是现行产品入口。

新界面接口：`/api/catalog`、`/api/catalog/ecosystems/:id`、`/api/catalog/sites/:id`、`/api/catalog/software/:id`、`/api/resources/:id/start`、`/api/resources/:id/versions`及十条文件分页。兼容接口保留：`/api/ecosystems`、`/api/resources?q=&ecosystem=&version=&site=`、`/api/sites/:id/resources`、`/api/resources/:id`、`/api/files?resource=&version=&platform=&arch=`。身份保留在后台；公开生态、首页／搜索／站点资源统一只返回有有效下载的条目，成功入库后自动出现。数字按可下载软件统计，不提前展示零资源分类。旧 `browse/package` 返回410；未接入条目不联网兜底。

## 发布与验收

公网 <https://mirror.campuslink.vip/> 是Caddy静态产物＋systemd API，同域 `/api`，不是开发服务器。升级前先后台准备新库、检查实际下载，之后直接切换，不备份可重采的抓取数据；部署脚本拒绝把现有包索引直接替换成空安装目录。新库上线且API核对通过后，显式退役旧库、旧队列及抓取备份；开发阶段不保留这些抓取数据备份。步骤见 [`docs/software-installer-catalog.md`](docs/software-installer-catalog.md) 与 [`docs/deployment.md`](docs/deployment.md)。容器形态仍见 `Dockerfile` / `docker-compose.yml`。

不做浏览器自动验收或UI单元测试。人工Todo见 [`docs/acceptance-checklist.md`](docs/acceptance-checklist.md)。

## 定向验证

```bash
pnpm build:shared
pnpm --filter @mirrorn/server typecheck
pnpm --filter @mirrorn/web typecheck
pnpm --filter @mirrorn/server test
MIRRORN_TEST_REDIS_BIN=/兼容Redis路径/redis-server node scripts/test-index-queue.mjs
pnpm exec tsx scripts/verify-pku-installers.ts
bash scripts/prepare-api-runtime.sh /tmp/新的空运行目录
node scripts/smoke-api-runtime.mjs /tmp/新的空运行目录
```

真实源站验证只请求少量目录元数据、用临时新库，不证明全站覆盖。临时Redis及API在验证结束自动停止；不操作生产服务。全项目测试／构建按实际需要运行。
