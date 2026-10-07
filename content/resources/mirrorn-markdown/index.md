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

离线速查是本站编写的内容，提供 Markdown 和纯文本两种格式。两者都是 **1.0** 版，但文件格式不同，因此分别作为两个产物，不伪装成同一文件的替代来源。

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

## 指令速查

| 功能 | 写法 | 引用对象 |
| --- | --- | --- |
| 单个下载 | `::download{source="reference-markdown"}` | 文件来源 |
| 选择下载 | `::download-select{group="reference-files"}` | 文件来源分组 |
| 来源列表 | `::source-list{group="reading-and-tools"}` | 文件、网页或命令来源 |
| 安装命令 | `::install-command{source="project-dependencies"}` | 包管理器来源 |
| 提示块 | `:::notice{type="info"}`，正文后用 `:::` 结束 | Markdown 正文 |
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
八种指令共用注册表、字段校验和组件实现。修改组件内部样式不会要求作者逐篇修改文档。
:::

## 继续贡献

下一篇说明资源如何从编辑、校验走到 PR 审核，以及如何修订或下架。

::resource-card{resource="mirrorn-contributing"}

- [ ] 先填写资源身份与真实来源。
- [ ] 修正内容校验指出的问题。
- [ ] 在本地阅读实际页面，检查下载、复制和窄屏布局。
