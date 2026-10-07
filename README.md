# MirrorN

**由贡献者通过 Git 共同维护的资源目录与文档站。**

MirrorN 人工整理软件、运行时、软件包、数据集、模型、系统镜像、容器和学习文档，将来源、安装方式和使用说明组织成可阅读、可交互的资源页面。不再作为镜像采集、测速或后台数据库管理系统开发。

## 当前状态

P1（新工程与主题基础）与 P2（内容契约与受限文档处理链）均已获用户确认验收并提交。P3 的来源组件、文档渲染与附件输出已实现，正式内容校验、58 文件类型检查与静态构建通过，已获用户确认功能验收并授权提交；UI／UX／样式优化后置，状态见 PLAN。

- 站点骨架已经可用：Astro 静态单包工程、顶部单行导航（首页／已收录／关于本站，窄屏横滑不折叠）、44px 图标切换亮／暗／跟随系统主题、首页、已收录目录、关于本站和真实 404 页面。
- 已有 v1 Schema、Markdown 自定义指令解析、来源／跨资源／锚点／附件校验、不可变资源注册表与 `content:check`，dev／build 使用同一处理链。
- 已实现纯函数 Resolver、八资源组件、受限 AST 渲染器、摘要附件静态输出与最小资源详情路由。已有 Markdown 编写指南与贡献指南两篇正式站内文档及两个离线附件；目录已接入真实计数与名称卡片。TOC、面包屑与搜索仍待后续阶段。
- 根目录旧依赖缓存已在 P1 迁出（可迁移部分保留在 `.local/legacy-runtime/`，不进入 Git，也不参与构建），新依赖按新的 `package.json` 与 `pnpm-lock.yaml` 安装。
- 后续阶段与当前状态见 [PLAN.md](PLAN.md)；首次公开发布前必须补全站点配置，见[交付门槛](docs/delivery.md#6-首次公开发布门槛)。

## 本地开发

要求 Node.js ≥ 24 与 pnpm ≥ 12（仓库声明 `packageManager: pnpm@12.8.1`，启用 corepack 时按该版本执行）。

```bash
pnpm install    # 按 package.json 与 pnpm-lock.yaml 安装依赖
pnpm dev        # 本地开发服务器，默认 http://localhost:4321
pnpm content:check # 检查所有资源，默认只交付公开注册表，不访问外网
pnpm typecheck  # astro check：新站、内容处理链与正式脚本的类型检查
pnpm build      # 同一内容校验通过后，生成静态产物到 dist/
pnpm preview    # 预览 dist/ 中的实际产物，默认 http://localhost:4321
```

本地草稿登记与自动化摘要：

```bash
pnpm content:check --include-drafts # 显式本地 preview 注册表；production 环境拒绝
pnpm content:check --json           # 仅输出摘要／已选资源 ID，不导出正文
```

草稿注册表不是草稿页面预览 UI；P3 资源页和附件固定使用公开集合，完整浏览与搜索仍留 P4／P5。`lint`、`test:content` 和 `check:dist` 尚未实现，不提供空命令。本次按用户要求未创建过渡测试或临时资源样本。

### 当前可验收文档

手动运行 `pnpm dev`，或用 `pnpm preview` 查看已构建产物（本次 6 页、2 个附件）：

- `/resources/mirrorn-markdown/`：Markdown 编写指南，实际使用八组件，有 Markdown／TXT 离线速查和校验值。
- `/resources/mirrorn-contributing/`：贡献指南，通过 ResourceCard 与编写指南互链。
- `/resources/`：展开「文档／学习资源」可进入以上两篇，其他分类仍为空。

两篇是长期维护的正式内容，不是临时测试资源。手工清单见 [P3 验收](docs/acceptance.md#本轮-p3-受影响-ui-与手工-todo)；浏览器点击、复制、主题和窄屏仍由维护者验收，构建通过不替代这些结果。

## 站点配置

站点名称、正式地址和贡献仓库集中在 [config/site.ts](config/site.ts)：

- `siteUrl` 与 `repositoryUrl` 目前保持 `null`：本地构建与预览照常完成，但不输出 canonical、不显示仓库链接，页面默认 `noindex`。
- P1 的 `siteUrl` 只支持站点根地址，例如 `https://mirrorn.test`；不支持带 `/docs/` 等子路径的部署。仓库地址可以包含真实仓库路径。404 始终禁止索引。
- 非法值（相对地址、占位域名、带用户名密码的地址、配置了仓库却没有默认分支）在配置加载阶段直接报错，不静默降级。
- 缺值只在 dev／build／preview 日志中提示，不阻塞本地开发；正式发布前必须补全。

## 目录结构

```text
src/pages/          基础页面、公开资源文档、摘要附件静态端点
src/layouts/        SiteLayout（站点外壳）、ResourceLayout（资源文档阅读布局）
src/components/     顶部导航、主题、受限渲染器与八资源组件
src/scripts/        原生复制与下载筛选（渐进增强）
src/styles/         设计 Tokens、基础／正文／资源组件样式
src/content/        Schema、解析、校验、Registry、Resolver、附件读取、Astro 校验集成
scripts/            正式内容校验 CLI
config/             站点级非机密配置
content/resources/  唯一资源内容根（当前两篇正式站内指南）
astro.config.ts     静态输出、站点地址与扫描边界
```

归档资料在 [archive/legacy](archive/legacy)，只是历史资料：不参与站点扫描、构建和类型检查。

## 阅读入口

| 需要了解 | 权威文档 |
| --- | --- |
| 产品定位、页面行为与范围 | [MAIN.md](MAIN.md) |
| 整个开发流程、阶段门槛、当前进度 | [PLAN.md](PLAN.md) |
| 视觉、顶部导航与响应式布局 | [DESIGN.md](DESIGN.md) |
| 技术架构、模块边界与目标目录 | [docs/architecture.md](docs/architecture.md) |
| 资源文档、Front Matter、来源和组件契约 | [docs/content-spec.md](docs/content-spec.md) |
| PR、贡献与内容维护 | [CONTRIBUTING.md](CONTRIBUTING.md) |
| 构建、部署、回退与日常维护 | [docs/delivery.md](docs/delivery.md) |
| 全项目验收条件 | [docs/acceptance.md](docs/acceptance.md) |
| 为什么放弃旧方向 | [docs/decisions.md](docs/decisions.md) |

## 使用与贡献

最终网站提供「首页」「已收录」「关于本站」三个顶层入口。首页搜索资源，已收录页按类别展开名称卡片，资源页展示文档与下载／安装组件。网站公开访问，无用户账号或管理后台。

内容以 Git 中的资源目录为唯一事实来源。通过 PR 添加、修订、下架资源；审核合并后由静态构建发布。资源写作格式为普通 Markdown＋自定义指令，站点统一映射为可复用组件，不要求作者编写 MDX／JSX 标签。

生产域名、实际贡献仓库链接和项目许可证尚未配置；首次公开发布前按[交付门槛](docs/delivery.md#6-首次公开发布门槛)落实。`example.com` 仅是原需求占位，不作为真实贡献入口。
