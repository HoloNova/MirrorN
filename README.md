# MirrorN

**开发常用资源与学习文档：下载直链、镜像入口和安装说明。**

MirrorN 是由贡献者通过 Git 共同维护的资源文档站。每项资源对应一个稳定页面，先提供实际获取入口，再说明适用条件、安装方式和用法。

官方下载、镜像下载、本站文件、下载页面和安装命令分别标明。并非每项资源都有镜像或本站文件，以页面提供的入口为准；不宣称未经验证的最快来源，不自动执行安装命令。

## 浏览资源

- **首页**：按名称、别名、简介和标签搜索，支持查询链接分享、键盘选择与失败重试。
- **已收录**：按分类浏览软件、工具链、依赖、数据集、模型、系统镜像、容器和学习文档。
- **资源页**：查看下载入口、安装命令、使用说明、来源记录与本页目录。
- **关于本站**：了解资源获取方式、贡献入口和许可。

资源文档包括 [Dev-C++](content/resources/dev-cpp/index.md)、[Visual Studio](content/resources/visual-studio/index.md) 和 [Visual Studio Code](content/resources/vscode/index.md)。

## 本地使用

环境要求：Node.js 24 LTS（≥ 24.16.0）、pnpm 12；项目声明 `pnpm@12.8.1`。

```powershell
pnpm install
pnpm dev
```

开发地址为 `http://localhost:4321`。生成和查看静态产物：

```powershell
pnpm build
pnpm preview
```

`dist/` 为纯静态站点产物，无需常驻应用服务器。普通构建生成 noindex 预览；正式发布使用 `pnpm build:release`，要求真实 HTTPS 站点地址和干净 Git 修订。配置、HTTP 404、缓存与整份产物发布方式见[交付说明](docs/delivery.md)。

## 内容与组件贡献

欢迎新增资源、修订学习文档、维护下载来源，也欢迎开发或优化 Markdown 展示组件。在 [HoloNova/MirrorN](https://github.com/HoloNova/MirrorN) 提交 PR。

资源以普通 Markdown＋声明式指令编写，来源与文件信息放在 `sources.json`。页面组件由站点统一实现，作者不需要写 MDX／JSX、导入组件或注入 CSS。

- [Markdown 编写指南](content/resources/mirrorn-markdown/index.md)：资源文件、元数据、来源规则和离线速查。
- [样式与组件参考](content/resources/mirrorn-components/index.md)：已注册功能的实际效果、可折叠写法与源码位置。
- [贡献指南](CONTRIBUTING.md)：内容与开发贡献、PR 审核和维护流程。

创建资源草稿并校验：

```powershell
pnpm resource:new my-resource
pnpm content:check --include-drafts
```

草稿不会进入公开页面、分类或搜索。准备公开时补齐字段并设为 `draft: false`，再执行：

```powershell
pnpm check
```

统一检查包括工程文档、长期模板、lint、内容、类型、一次静态构建与产物引用／摘要校验。页面体验由贡献者本地人工检查，不以静态检查代替 UI 验收。合并 PR 后仍需构建与发布，公开站点才会更新。

## 技术与目录

全站 UI 使用 React＋TypeScript／TSX，React Router＋Vite 静态预渲染完整 HTML。资源正文使用 unified／remark 解析 Markdown，Schema 与引用校验通过后生成公开 Registry；分类、搜索与页面均由同一份资源内容派生。

```text
content/resources/       资源正文、来源和小型附件
src/routes/             页面
src/components/         导航、搜索和资源展示组件
src/styles/             主题、排版与组件样式
src/content/            解析、校验、来源解析和搜索
src/delivery/           静态产物与摘要检查
config/                 站点和发布配置
scripts/                校验、贡献模板和构建工具
templates/              资源草稿模板
public/font-licenses/   自托管字体的原始许可
docs/                   产品、架构、内容和交付规范
```

本站不建设账号系统、管理后台或数据库，不代理第三方文件，不自动采集、测速或换源。

## 项目规范

[产品定位](MAIN.md) · [设计规范](DESIGN.md) · [技术架构](docs/architecture.md) · [内容契约](docs/content-spec.md) · [文档索引](docs/README.md)

## 许可

代码与原创程序示例采用 [MIT](LICENSE)，原创文档采用 [CC BY 4.0](LICENSE-DOCS)，贡献者保留版权。第三方软件、字体、图片与附件按各自原许可，不因收录而重新授权。完整范围见[许可说明](docs/licensing.md)。
