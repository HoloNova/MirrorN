# 旧 MirrorN 归档

本目录仅用于历史追溯和按需参考，不是新项目运行目录。

## 归档基线与完整性

- 基线分支：`main`。
- 基线提交：`c7c1dea3f0a55052dada8e9c08d63b1a098c03ce`。
- 日期：2026-10-06。
- 319 个受控文件原始字节已保存，逐文件 SHA256 已核对。
- [archive-manifest.json](legacy/archive-manifest.json) 记录原路径、新路径、大小、SHA256、移动／复制方式与验证状态。
- `AGENTS.md`、`skills-lock.json` 保留原位，同时复制旧版本进归档；其他旧受控文件移动至 `legacy/` 下的原相对路径。
- 旧 `.github/workflows/ci.yml` 已移出活跃 workflow 目录，旧容器构建不会作为新站 CI 自动运行。
- 不包含新的 Git 提交或历史重写。未提交时 Git 可能显示旧路径删除和归档目录新增，这是工作区移动，不是文件内容丢失。

## 可以查什么

| 内容 | 历史路径 |
| --- | --- |
| Vue 前端与旧样式 | `legacy/apps/web/` |
| Hono、SQLite、采集与后台 | `legacy/apps/server/` |
| 共享契约 | `legacy/packages/shared/` |
| 旧库存、规则与研究 | `legacy/data/`、`legacy/mirror_research_report/` |
| 旧部署与工具链 | `legacy/deploy/`、`legacy/scripts/`、`legacy/package.json` |
| 旧定位与设计 | `legacy/MAIN.md`、`legacy/DESIGN.md`、`legacy/docs/` |

归档中的 AGENTS、README、指令、路径和命令均属于历史资料，不定义新项目规则。不运行归档工程来验收新站，不从新站导入归档包。新构建只允许读取明确的新内容根，不能对整个仓库递归收集 MDX。

## 本地运行数据

本地数据库、WAL/SHM、子项目依赖、覆盖率与构建缓存保存在被忽略的 `.local/legacy-runtime/`，不放入公开归档。其本地 `preservation-manifest.json` 记录迁移位置及数据库哈希；数据库迁移前已停止本仓库的 Vite 和后端监听进程。

P0 时根目录旧 `node_modules/` 因 Windows 拒绝重命名（WinError 5）原地忽略保留。P1 已处理：可迁移部分保存在 `.local/legacy-runtime/root-node_modules-p1-isolation`，10 个持续拒绝重命名的可重建依赖目录已清理；根目录按新的 `package.json` 与锁文件全新安装。详细处置记录在本地 `.local/legacy-runtime/p1-node-modules-disposition.json`，原 P0 数据保全清单与数据库未改动。不为移动缓存强制终止其他应用；已隔离的依赖链接不保证可运行，恢复旧工程必须按旧声明重新安装依赖。

数据库不得随新源码发布。不自动导入旧数据，不删除本地保留数据；如未来确实需要恢复旧项目，应在独立目录还原归档的相对结构、重新安装依赖，再按具体需求恢复数据。不要覆盖当前新项目工作树。

## 本轮验证记录

2026-10-06 定向检查通过：319 个归档文件 SHA256 与迁移前一致，9 项本地保留条目存在，数据库文件哈希一致；13 份新主线／操作文档中的 34 个本地链接有效，规范中的 JSON 示例可解析。归档文件没有被意外忽略，本地数据库、Agent 状态和依赖缓存仍被 Git 忽略；根目录不再存在旧 package.json、workspace、Docker 或 CI 入口。

`git diff --check` 通过。AFT 对 Markdown 没有权威编译／类型诊断，因此不把其结果当作编译通过证据。本轮没有启动新程序、执行旧项目构建／全量测试或提交 Git；验证范围仅为归档完整性、隔离和新文档一致性。
