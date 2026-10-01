# MirrorN

MirrorN 为初学者在镜像站查找软件安装文件和依赖：搜索软件/生态，按用途、版本、系统及架构找到**镜像站直接提供的下载链接**；已有安装后 Markdown 教程排在下载区下方。本站只存目录和文件索引，不转发文件，也不执行修改本机配置的命令。

**当前范围（2026-09-29）**：收录 28 个站点，北大站的 40 条官方目录已经归类并接入站内搜索。安装器、ISO 和有限数据集的文件索引定时刷新；北大大型软件仓库按需逐目录查询，PyPI 可按指定包名查文件。其余 27 站尚未整理完整目录；教程目前只有 Miniconda 和 Node.js 两篇，不把有没有教程当成能否提供下载链接的条件。开发决策与现行数据流见 [`docs/resource-product-unification-proposal.md`](docs/resource-product-unification-proposal.md)、[`PLAN.md`](PLAN.md) 第七节及 [`docs/decisions.md`](docs/decisions.md)；`MAIN.md` 后续章节是历史立项规划。

## 开发

要求 **Node.js >=24**、pnpm 12。镜像站/资源归类先由 `data/` 审核，构建前运行数据校验；首次启动后端会把审核数据导入 SQLite，并抓取少量适合定时索引的文件目录。

```bash
pnpm install
pnpm dev
```

前端：<http://127.0.0.1:5173/>；后端：<http://127.0.0.1:8787/api/health>。前端通过 Vite 代理访问同源 `/api`；**只启动前端并不能浏览下载目录**。开发端口被占用时会预检拒绝启动，以免两份 Vite 共用依赖缓存。可以用 `pnpm dev:web` / `pnpm dev:server` 分别启动，但资源页仍需要后端。离开会话请停止开发进程。

后端默认监听 `127.0.0.1`，端口、站点数据路径、数据库目录等由 `MIRRORN_*` 环境变量控制，详见 [`docs/deployment.md`](docs/deployment.md)。本地抓取不能代表访客网络的速度；站点详情的手动测速只测响应耗时，不推导实际下载速度。

## 当前数据流

| 位置                                                                                                  | 职责                                                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `data/mirrors.json`、`data/site-inventories/`、`data/site-resources/`、`data/ecosystem-taxonomy.json` | 审核的站点身份、官方仓库目录、生态/用途与下载入口；不是运行时文件清单。    |
| `apps/server/src/db/`                                                                                 | `node:sqlite` 的目录/文件/抓取记录与按需目录缓存；前端统一读取这里的 API。 |
| `apps/server/src/crawl/`                                                                              | 按用途限量刷新安装器/ISO，或由请求触发北大目录及 PyPI 单包查询。           |
| `apps/web/src/pages/`、`apps/web/src/lib/resourceApi.ts`                                              | 首页、站点页与下载页使用同一后端目录；文件直链由镜像站提供。               |
| `apps/web/src/tutorials/`、`data/tutorials.json`                                                      | 现有 Markdown 教程正文与资源关联；无教程的资源仍可下载。                   |

旧的命令向导模板与测试仍存放在 `data/ecosystems/`、`packages/shared/src/generators/` 等目录，但没有产品路由；它们是待独立清理的首版遗留内容，**不是当前下载业务的数据来源**。首页不自动测速，也不生成换源命令。

主要接口：`GET /api/ecosystems`（筛选）、`GET /api/resources?q=&ecosystem=&site=`（统一搜索）、`GET /api/resources/:id`（文件列表）、`GET /api/resources/:id/browse?path=`（北大逐层目录）、`GET /api/resources/:id/package?name=`（北大 PyPI 指定包）。目录请求受路径、域名、响应大小和时效约束；具体策略见 [`docs/resource-product-unification-proposal.md`](docs/resource-product-unification-proposal.md)。

## 公网发布与验收

公网 <https://mirror.campuslink.vip/> 由 Caddy 提供静态文件，同域 `/api` 转发给 systemd `mirrorn-api`；**不暴露开发服务器**。前端需要在构建时设置 `VITE_API_BASE=/`；项目发布脚本会代办。后端资源库在 `/var/lib/mirrorn/mirrorn.sqlite`，改表前应做一致性备份（WAL 数据不一定都在主文件中）。

```bash
sudo scripts/deploy-api.sh
sudo scripts/deploy-static.sh
```

两种部署方式和回滚步骤见 [`docs/deployment.md`](docs/deployment.md)。容器形态见 `Dockerfile` / `docker-compose.yml`，同样要求 Node 24，资源库随数据卷保留。界面只在**公网人工验收**，清单在 [`docs/acceptance-checklist.md`](docs/acceptance-checklist.md)；不使用 Playwright/UI 自动化代验。

## 定向检查

```bash
pnpm validate:data
pnpm --filter @mirrorn/server typecheck
pnpm --filter @mirrorn/web typecheck
pnpm --filter @mirrorn/server test
pnpm build:web
pnpm --filter @mirrorn/server build:bundle
```

`pnpm test` / `pnpm build` 会扩到旧版尚未清理的包；按改动范围选择检查，部署前确保相关代码、数据校验与打包通过。`docs/validation-matrix.md` 和 `MAIN.md` 记录首版配置向导时代的验证与规划，不代表当前下载入口。
