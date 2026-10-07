# MirrorN

**由贡献者通过 Git 共同维护的资源目录与文档站。**

MirrorN 人工整理软件、运行时、软件包、数据集、模型、系统镜像、容器和学习文档，将来源、安装方式和使用说明组织成可阅读、可交互的资源页面。不再作为镜像采集、测速或后台数据库管理系统开发。

## 当前状态

P1–P4 已获用户确认验收并提交，P4 为 `8490afd`，均未推送。P5 首页搜索和公开摘要索引、P6 的 MDN 风格视觉与可访问性完善均已获用户确认验收，74 文件类型检查与新站构建通过；P5／P6 已按授权合并提交 `c8eb513`，未推送。P7 平台无关贡献／CI／产物门禁已实现、通过本地检查并获用户确认验收；域名与托管后置，代码 MIT、原创文档 CC BY 4.0 已确定。状态见 PLAN。

- 站点骨架已经可用：Astro 静态单包工程、顶部单行导航（首页／已收录／关于本站，窄屏横滑不折叠）、44px 图标切换亮／暗／跟随系统主题、首页、已收录目录、关于本站和真实 404 页面。
- 已有 v1 Schema、Markdown 自定义指令解析、来源／跨资源／锚点／附件校验、不可变资源注册表与 `content:check`，dev／build 使用同一处理链。
- 已实现纯函数 Resolver、八资源组件、受限 AST 渲染器、摘要附件静态输出与最小资源详情路由。已有 Markdown 编写指南与贡献指南两篇正式站内文档及两个离线附件；目录已接入真实计数与名称卡片。已接通左侧 TOC 与元信息，取消与顶部 Tab 重复的层级面包屑；首页已接通 Fuse.js 加权搜索、查询恢复、键盘选择与失败重试。
- 根目录旧依赖缓存已在 P1 迁出（可迁移部分保留在 `.local/legacy-runtime/`，不进入 Git，也不参与构建），新依赖按新的 `package.json` 与 `pnpm-lock.yaml` 安装。
- 后续阶段与当前状态见 [PLAN.md](PLAN.md)；首次公开发布前必须补全站点配置，见[交付门槛](docs/delivery.md#6-首次公开发布门槛)。

## 本地开发

要求 Node.js 24 LTS（≥ 24.16.0）与 pnpm ≥ 12（仓库声明 `packageManager: pnpm@12.8.1`，启用 corepack 时按该版本执行）。

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

草稿注册表不是草稿页面预览 UI；资源页、目录、附件与搜索索引固定使用公开集合。P7 已实现 lint、模板／文档和产物门禁，不提供空 test:content 命令。本次按用户要求未创建过渡测试或临时资源样本。

### 当前可验收文档

手动运行 `pnpm dev`，或用 `pnpm preview` 查看已构建产物（本次 6 页、2 个附件、1 个摘要搜索索引）：

- `/`：首页搜索，可查询 `MirrorN`、`PR 指南`、`wen dang bian xie zhi nan`、`gong xian zhi nan`；`/?q=Markdown` 可分享并恢复查询。
- `/resources/mirrorn-markdown/`：Markdown 编写指南，实际使用八组件，有 Markdown／TXT 离线速查和校验值。
- `/resources/mirrorn-contributing/`：贡献指南，通过 ResourceCard 与编写指南互链。
- `/resources/`：展开「文档／学习资源」可进入以上两篇，其他分类仍为空。

两篇是长期维护的正式内容，不是临时测试资源。P3、P4 本轮功能已获用户确认；导航与阅读清单见 [P4 验收](docs/acceptance.md#本轮-p4-受影响-ui-与手工-todo)。桌面左目录跟随阅读自动高亮，窄屏移至正文顶部可折叠，顶部 Tab 全程吸顶、不折叠。构建通过不替代浏览器验收。P5 已获用户确认，主要验收范围为首页搜索，名称／别名／拼音、方向键／中文输入法、返回恢复、无结果／加载失败重试和无 JS 目录入口见 [P5 清单](docs/acceptance.md#本轮-p5-受影响-ui-与手工-todo)。

### P6 视觉验收

本轮涉及全站字体／焦点／主题、首页搜索布局、目录分类、两篇资源页的正文／组件，以及关于和 404；不更改文档契约或 P5 检索行为。字体只自托管 Latin 子集，中文由系统字体显示；使用 `font-display: swap`，字体请求失败仍可读。可从关于页查看原始字体许可，本站代码 MIT、原创文档 CC BY 4.0 已按维护者授权确定，第三方字体仍按 OFL。

手工清单见 [P6 验收](docs/acceptance.md#本轮-p6-受影响-ui-与手工-todo)，正式内容、74 文件 Astro check（零错误／警告／提示）和静态构建通过；静态门禁不代表视觉与辅助技术已经人工通过。

## 站点配置

站点名称、正式地址和贡献仓库集中在 [config/site.ts](config/site.ts)：

- `siteUrl` 仍为 `null`：本地构建与预览照常完成，不输出 canonical，页面默认 `noindex`。
- `repositoryUrl` 已按 origin 核实为 `https://github.com/HoloNova/MirrorN`，默认分支按远端 HEAD 核实为 `main`。GitHub 编辑链接指向 `content/resources/<id>/index.md`，只打开平台编辑器，不自动提交 PR；未配置仓库或不是受支持的 GitHub 仓库时不输出编辑链接。
- 新资源尚未推送到远端，当前编辑入口仅完成地址接通；GitHub 在线编辑须等对应文件推送后才能使用。本轮不推送，不把本地构建通过写成远端文件已可编辑。
- P1 的 `siteUrl` 只支持站点根地址，例如 `https://mirrorn.test`；不支持带 `/docs/` 等子路径的部署。仓库地址可以包含真实仓库路径。404 始终禁止索引。
- 非法值（相对地址、占位域名、带用户名密码的地址、配置了仓库却没有默认分支）在配置加载阶段直接报错，不静默降级。
- 缺值只在 dev／build／preview 日志中提示，不阻塞本地开发；正式发布前必须补全。

## 目录结构

```text
src/pages/          基础页面、公开资源文档、摘要附件／搜索索引静态端点
src/layouts/        SiteLayout（站点外壳）、ResourceLayout（资源文档阅读布局）
src/components/     顶部导航、主题、首页搜索、受限渲染器与八资源组件
src/scripts/        原生复制／下载筛选、顶栏测量、章节追踪、分类定位与按需检索（渐进增强）
src/styles/         本地字体、设计 Tokens、基础／正文／资源组件／搜索样式
public/font-licenses/ 字体上游版权与完整 OFL（随静态产物分发）
src/content/        Schema、解析、校验、Registry、Resolver、附件读取、搜索索引／排序、Astro 校验集成
src/delivery/       P7 产物摘要、HTML／CSS／ESM 与公开集合检查
scripts/            正式校验／贡献草稿／发布产物 CLI
templates/          长期贡献模板，非已收录内容
.github/workflows/  只读校验与 noindex 产物 CI，不部署
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

贡献仓库地址已核实配置；生产域名与托管尚未配置，项目许可已确定为 MIT／CC BY 4.0，远端资源文件和编辑入口仍须实际落实；首次公开发布前按[交付门槛](docs/delivery.md#6-首次公开发布门槛)落实。`example.com` 仅是原需求占位，不作为真实贡献入口。

## P7 贡献与交付命令

```powershell
pnpm resource:new my-resource  # 主动创建工作草稿；不会覆盖已有资源
pnpm template:check            # 校验长期贡献模板，不创建样本
pnpm docs:check                # 仅工程文档及内链
pnpm lint                      # 仅新源码、Astro 与正式工具
pnpm check                     # 全部正式门禁，只构建一次 noindex 预览
pnpm check:dist                # 检查当前 dist 是否仍对应当前公开内容
```

当前正式域名／主机按用户要求后置。普通 build 与 PR CI 默认 preview，即使以后填写域名也不会自动公开索引。`pnpm build:release` 要求真实 HTTPS siteUrl 与已提交的干净 Git 修订，只生成和检查产物，不部署；未配置时明确失败。

新 CI `.github/workflows/verify.yml` 冻结安装后执行同一门禁，仅工程文档变动不重复构建；没有部署权限或 Secret。完整产物携带 build-info.json、逐文件 SHA256 和完整许可证。实际云端运行、源码推送及发布流程尚未执行。

代码采用 [MIT](LICENSE)，原创文档采用 [CC BY 4.0](LICENSE-DOCS)，原创程序示例仍为 MIT。第三方文件与归档不被重新授权，详细范围与署名方式见 [许可说明](docs/licensing.md)。
