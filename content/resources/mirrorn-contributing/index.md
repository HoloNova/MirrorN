---
schemaVersion: 1
id: mirrorn-contributing
name: MirrorN 贡献指南
summary: 新增开发资源、修订学习文档、维护下载来源，以及开发或优化 Markdown 展示组件的贡献流程。
category: document
tags:
  domain: [documentation]
  format: [text]
  license: [CC-BY-4.0]
aliases: [贡献流程, PR 指南, gong xian zhi nan]
authors: [MirrorN]
publishedAt: 2026-10-07
updatedAt: 2026-10-08
draft: false
status: active
---

## 可以贡献什么

MirrorN 整理开发常用资源与学习文档，提供下载直链、镜像入口和安装说明。欢迎新增资源、补充教程、修订来源、记录失效入口，也欢迎开发或优化 Markdown 展示组件。

内容与源码通过 [项目仓库](https://github.com/HoloNova/MirrorN) 的 PR 维护，没有站内编辑后台。先检查已收录目录，已有资源优先修改原页，不按每个版本重复收录。

## 贡献资源与文档

:::steps
1. Fork 仓库并建立工作分支，先阅读编写指南和已有资源。
2. 新增资源时运行 `pnpm resource:new <id>` 创建草稿；修订时直接修改原资源目录。
3. 在 `index.md` 讲清用途、获取方式与必要操作，在 `sources.json` 维护文件、来源、命令及附件声明。
4. 检查来源与许可；没有核实的版本、架构、摘要或可用状态不要补成事实。
5. 补齐发布字段并设为 `draft: false`，运行检查并自行查看本地页面。
6. 在自己的分支提交修改，发起 PR，说明改动、来源依据与已完成的检查。
:::

::resource-card{resource="mirrorn-markdown"}
::resource-card{resource="mirrorn-components"}

正文使用 Markdown 与注册指令，不需导入组件。图片和小型附件放在资源内的 `assets/`；大型安装包使用真实下载来源，不超出仓库附件预算。

## 贡献 Markdown 样式与组件

你可以修正文档排版、优化已有组件，也可以提出新的可复用展示功能。**统一组件在站点源码里实现，资源作者通过 Markdown 使用它们**，不让每篇文章复制一套 CSS 或交互代码。

| 改动 | 主要位置 |
| --- | --- |
| 普通 Markdown 排版 | `src/styles/prose.css` |
| 资源控件样式 | `src/styles/resource-components.css`（含代码框、来源与下载控件） |
| 亮暗主题、颜色与间距 | `src/styles/tokens.css` |
| React 资源组件 | `src/components/resource/` |
| 指令名、参数与组件映射 | `src/content/schema/directives.ts` |
| Markdown 解析与结构限制 | `src/content/parse/markdown.ts`、`src/content/parse/directive-syntax.ts` |
| 指令引用和内容校验 | `src/content/validate/` |
| 节点到组件的渲染 | `src/components/resource/DocumentNodes.tsx` |

修改已有样式时保留指令含义与旧文档兼容，优先复用主题 Token。增加指令时先说明“现有功能为什么不够”，再同步参数契约、允许的嵌套、校验、渲染、内容规范和组件参考。不要只注册名称却留下空组件，也不要允许文档传入任意 HTML 属性或执行代码。

:::details{title="开发贡献的检查顺序"}
```powershell
pnpm lint
pnpm content:check
pnpm typecheck
pnpm build
pnpm check:dist
```

也可以运行 `pnpm check` 完成统一检查，不需要再重复上述全部命令。涉及界面时列出受影响页面与人工检查项，包括亮暗主题、窄屏、键盘、复制及关闭 JavaScript 后的基本阅读；不添加 UI 单元测试或浏览器自动验收。
:::

## 内容校验与本地阅读

草稿可先检查身份、语法和引用：

```powershell
pnpm content:check --include-drafts
```

草稿不会生成页面；准备公开时补齐作者、简介、日期等字段并设为 `draft: false`，运行：

```powershell
pnpm check
```

由贡献者自行启动本地开发或预览，在 `/resources/<id>/` 阅读实际页面。内容、类型与构建检查不是页面验收，也不会自动执行安装命令。

## PR 说明

PR 应写清资源 ID 或组件名称、增加／修订的用途、下载或资料的来源、附件许可，以及已做与尚未做的检查。若只检查了文件入口，不写成“安装验证通过”。

资源页的“编辑此页”只打开 GitHub 文件编辑器。涉及来源或附件的改动放在同一个工作分支；审核中继续更新同一个 PR，不为每次保存另建 PR。

维护者审核并合并后，仍需完成静态构建与发布，公开站点才会更新。PR 合并不等于已经上线。

## 后续维护

| 情况 | 处理方式 |
| --- | --- |
| 增加版本、平台或封装 | 新增产物及来源，说明适用条件 |
| 同一文件增加镜像 | 核对字节身份后引用同一 artifact，否则独立声明产物 |
| 某条来源失效 | `health: broken` 并填写 `note`，不自动下架整篇教程 |
| 不再推荐资源 | `status: deprecated` 并写 `statusReason` |
| 保留历史资料 | `status: archived` 并说明原因 |
| 撤下或删除资源 | 先修正其他公开文章的引用，再设为草稿或删除目录 |

修改正文时更新 `updatedAt`，作者列表记录实际贡献者，不把 CI 机器人当作者。

## 内容与源码许可

新站代码与原创程序示例采用 MIT，原创文档采用 CC BY 4.0，贡献者保留版权。转载材料须保留出处和许可并说明修改；第三方软件、图片和附件按各自许可，收录不是重新授权。无需签署 CLA。
