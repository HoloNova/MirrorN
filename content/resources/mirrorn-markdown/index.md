---
schemaVersion: 1
id: mirrorn-markdown
name: MirrorN Markdown 编写指南
summary: 介绍本站的 Markdown 写作与来源引用规范，并提供可下载的离线速查。
category: document
tags:
  domain: [web, documentation]
  platform: [any]
  format: [text]
  license: [CC-BY-4.0]
aliases: [文档编写指南, Markdown 写作, 组件使用指南, wen dang bian xie zhi nan]
authors: [MirrorN]
publishedAt: 2026-10-07
draft: false
status: active
defaultVersion: "1.0"
---

## 如何使用这份指南

MirrorN 的资源正文是普通 Markdown，加上站点定义的指令语法。作者不用导入组件、写 JSX 标签，或为每篇文章编写交互代码。这份指南本身就使用同一套解析和渲染链，下面的下载、命令和表格都来自它的 `sources.json`。

:::notice{type="info" title="文档与来源分开维护"}
在 `index.md` 中讲解资源用途，在 `sources.json` 中维护产物与来源。指令只引用稳定 ID，更新地址时不用重写正文。
:::

## 下载离线速查

离线速查是本站编写的内容，提供 Markdown 和纯文本两种格式。两份离线速查均为本站原创，采用 CC BY 4.0，原创程序示例采用 MIT。两者都是 **1.0** 版，但文件格式不同，因此分别作为两个产物，不伪装成同一文件的替代来源。

::download-select{group="reference-files"}

如果只需要 Markdown 格式，可以直接下载：

::download{source="reference-markdown" label="下载 Markdown 速查"}

## 查看文件校验值

下面是 Markdown 速查实际文件的 SHA256。下载后可在本机计算并对比；这里的附件摘要已由构建链核对，不代表本站验证了任何第三方远程文件。

::checksum{artifact="reference-markdown-v1"}

在 PowerShell 中计算：

```powershell
Get-FileHash -Algorithm SHA256 .\mirrorn-markdown-reference.md
```

## 安装项目依赖

在项目根目录安装当前锁文件声明的依赖；安装环境要求 Node.js 24 或更新版本，并使用项目声明的 pnpm 版本。按钮只复制命令，不自动执行。

::install-command{source="project-dependencies"}

完成写作后检查内容，再构建静态页面：

```bash
pnpm content:check
pnpm typecheck
pnpm build
```

:::notice{type="warning" title="没有匹配文件时不要猜测"}
选择器区分“未注明”和“全部”。不同格式、平台、架构或版本应各自声明产物；来源切换只在同一产物内进行，不偷偷换下载文件。
:::

## 阅读与编辑条件

离线速查是文本，不要求特定 CPU 架构。下表是格式使用说明，不是运行测试结果；项目构建工具的要求见上文。

::compatibility-table{table="reference-support"}

## 只想放一个链接

只需要一个入口、不需要版本筛选或校验值时，可以不进 `sources.json`，直接在正文写链接。`label` 必须写清按钮的真实行为；`target` 为 `file`（默认）是文件下载，为 `page` 是访问网页，二者不能混用。

```markdown
::download{url="https://github.com/HoloNova/MirrorN" target="page" label="打开项目仓库"}
::download{url="https://example.com/tool.zip" label="下载 tool.zip" status="available" checked="2026-10-07"}
```

下面是实际渲染效果，状态未填写，所以显示“未验证”：

::download{url="https://github.com/HoloNova/MirrorN" target="page" label="打开项目仓库"}

状态由维护者手写，不是实时检测：`status` 可填 `available`（必须同时写核查日期 `checked`）、`broken`（必须在 `note` 说明原因）或省略为未验证。徽章旁边始终显示核查日期。需要多个来源、版本筛选或校验值时，仍然使用 `sources.json`。

:::notice{type="note" title="灰色备注"}
`type="note"` 是中性的补充说明；`info`、`warning`、`danger`、`success` 各自带不同图标，不只靠颜色区分。
:::

## 选项、步骤、折叠与脚注

**选项切换**用于“同一件事有几种做法”，例如不同系统的安装方式。外层多写一个冒号：

```markdown
::::choice{label="选择获取方式"}
:::option{label="下载文件"}
::download{source="reference-markdown"}
:::
:::option{label="复制命令"}
::install-command{source="project-dependencies"}
:::
::::
```

下面是实际效果。它与上文的下载选择器不同：下载选择器按 `sources.json` 的版本、平台筛选文件，选项切换则由作者决定每个选项里放什么。

::::choice{label="选择获取方式"}
:::option{label="下载文件"}
::download{source="reference-markdown"}
:::
:::option{label="复制命令"}
::install-command{source="project-dependencies"}
:::
::::

选项里可以放普通 Markdown、下载、命令、提示块和步骤，但不能再嵌套选项或折叠块，也不能放标题（标题放在选项外面，右侧目录才指得到）。至少两个选项，标签不能重复。关闭 JavaScript 时所有选项会依次展开，内容不会丢。

**步骤**把一个有序列表显示成带编号的时间轴：

```markdown
:::steps
1. 安装依赖。
2. 运行内容检查。
:::
```

:::steps
1. 安装项目依赖：`pnpm install`。
2. 检查内容：`pnpm content:check`，修正它指出的行列问题。
3. 在本地阅读实际页面，再提交 PR。
:::

**折叠块**收起次要内容，如长日志或常见问题：

:::details{title="为什么选项里不能写标题？"}
折叠或隐藏的内容里如果有标题，右侧“本页目录”就会指向看不见的位置。所以标题只能写在选项、折叠块和脚注的外面。
:::

**脚注**用 GFM 原生写法：正文写 `[^名称]`，在任意位置另起一行写 `[^名称]: 说明`。编号按正文里出现的先后自动生成，说明统一列在文末并可返回。引用和定义必须成对，缺一个都会报错。

脚注示例：本站使用受限的 Markdown 子集[^subset]，不执行文档里的代码。

[^subset]: 解析使用 remark，指令白名单与字段校验见内容规范；原始 HTML、JSX 和脚本都会被拒绝。

## 指令速查

| 功能 | 写法 | 引用对象 |
| --- | --- | --- |
| 单个下载 | `::download{source="reference-markdown"}` | 文件来源 |
| 行内链接 | `::download{url="https://…" label="…"}` | 无，直接写在正文 |
| 选择下载 | `::download-select{group="reference-files"}` | 文件来源分组 |
| 来源列表 | `::source-list{group="reading-and-tools"}` | 文件、网页或命令来源 |
| 安装命令 | `::install-command{source="project-dependencies"}` | 包管理器来源 |
| 选项切换 | `::::choice{label="…"}` 内放若干 `:::option{label="…"}`，各自用 `:::` 结束，最后 `::::` 结束 | Markdown 与叶子指令 |
| 步骤 | `:::steps` 内一个有序列表 | 有序列表 |
| 折叠块 | `:::details{title="…"}`，用 `:::` 结束 | Markdown 与叶子指令 |
| 脚注 | 正文 `[^名称]`，另起一行 `[^名称]: 说明` | 同一文档内 |
| 提示块 | `:::notice{type="info"}`，正文后用 `:::` 结束；类型 info／warning／danger／success／note | Markdown 正文 |
| 校验值 | `::checksum{artifact="reference-markdown-v1"}` | 具体产物 |
| 兼容说明 | `::compatibility-table{table="reference-support"}` | 说明表 |
| 关联文档 | `::resource-card{resource="mirrorn-contributing"}` | 另一个公开资源 |

:::notice{type="danger" title="示例代码不作为页面代码执行"}
文档不允许原始 HTML、JSX 或脚本。要解释这些写法，请放进代码块；普通文字中的花括号也不会被当作 JavaScript 执行。
:::

## 其他阅读与工具入口

下面分别标明本站附件、项目依赖命令、Astro 文档和源代码仓库。网页或仓库是阅读入口，不冒充可直接下载的文件。

::source-list{group="reading-and-tools"}

:::notice{type="success" title="所有功能使用站点统一实现"}
所有指令共用注册表、字段校验和组件实现。修改组件内部样式不会要求作者逐篇修改文档。
:::

## 继续贡献

下一篇说明资源如何从编辑、校验走到 PR 审核，以及如何修订或下架。

::resource-card{resource="mirrorn-contributing"}

- [ ] 先填写资源身份与真实来源。
- [ ] 修正内容校验指出的问题。
- [ ] 在本地阅读实际页面，检查下载、复制和窄屏布局。
