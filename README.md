# MirrorN

面向初学者的生态资源与教程网站。逐个生态人工整理版本、平台资源、来源直链、依赖说明与Markdown教程，审核后发布，不汇总全部镜像库存。首页只保留搜索，生态页展示已收录内容，站点分类暂不展示。文件、目录和仓库入口使用不同按钮，不下载安装包、不代理包体、不执行用户本机命令。

## Windows 本地开发

要求 Node.js 24+、项目锁定的 pnpm。新人工管理使用 Node 内置 SQLite，**不需要 Redis**。

```sh
pnpm install
pnpm admin:setup
pnpm dev
```

`admin:setup` 交互设置用户名和密码（不回显，至少12字符），没有默认密码；重置用 `pnpm admin:setup --reset`。

- 首页：<http://127.0.0.1:5173/>
- 生态列表：<http://127.0.0.1:5173/#/ecosystems>
- 管理后台：<http://127.0.0.1:5173/#/admin>
- 后端健康接口：<http://127.0.0.1:8787/api/health>

默认人工库 `apps/server/.data/mirrorn-curated.sqlite`。先创建生态，再添加版本、资源来源、依赖和教程，将完成条目标记为“发布时收录”，预览后发布。编辑稿与公开快照分离，保存不会立即覆盖公开内容。

根目录 `.env` 由后端和维护命令读取；配置目录用 `MIRRORN_SNAPSHOT_DIR`。完整操作、字段口径、接口、备份恢复及人工验收清单见 [`docs/curation-management.md`](docs/curation-management.md)；主线说明见 [`MAIN.md`](MAIN.md)。

`pnpm dev` 使用UTF-8启动器，直接调用Vite／tsx入口，避免Windows嵌套批处理退出提示。网页通过同源 `/api` 连接后端，仅启动前端不能管理内容。前后端由用户自行启动验收，本轮不更新公网。

## 备份人工内容

```sh
pnpm content:backup backups/content-2026-10-06.sqlite
```

创建一致性SQLite备份，不覆盖已有文件；后台也可导出不含账号的JSON。人工内容不能依赖重采恢复，需保存备份。默认数据目录与 `backups/` 不提交仓库。

## 新代码入口

| 位置                                | 职责                                            |
| ----------------------------------- | ----------------------------------------------- |
| `packages/shared/src/curation.ts`   | 人工内容契约、结构和引用校验                    |
| `apps/server/src/curation/`         | 独立SQLite、发布快照、管理员会话、管理及公开API |
| `apps/web/src/pages/Admin*.vue`     | 管理列表、分区编辑、预览及发布                  |
| `apps/web/src/components/curation/` | 表单、来源链接、公开内容和安全Markdown          |
| `apps/web/src/pages/Curated*.vue`   | 已收录生态列表及详情                            |
| `data/mirrors.json`                 | 仍可复用的站点身份和测速元数据，不是收录清单    |

## 保留的旧功能

`indexing/`、旧文件查询API、自动版本规则和 `mirrorn-installers.sqlite` 暂不移除，但旧采集默认关闭，旧数据不进入新搜索／生态目录。显式设置 `MIRRORN_CRAWL_ENABLED=true` 可运行旧采集，它仍需要Redis；Docker Desktop的服务地址 `redis://127.0.0.1:6389/0`，启动命令 `docker compose up -d redis`。

旧采集设计文档保留作历史参考，不能作为恢复批量导入或删除人工数据的依据。测速本阶段仅复用原有偏好与有效缓存，不新增自动监控、批量导入或依赖安装。

## 定向检查

```sh
pnpm build:shared
pnpm --filter @mirrorn/server typecheck
pnpm --filter @mirrorn/web typecheck
pnpm --filter @mirrorn/server exec vitest run src/curation/curation.test.ts src/config.test.ts
pnpm --filter @mirrorn/web exec vitest run src/lib/markdown.test.ts
```

不做UI单元测试、浏览器自动验收或全量构建测试。受影响UI及人工Todo见 [`docs/curation-management.md`](docs/curation-management.md#人工验收-todo)。
