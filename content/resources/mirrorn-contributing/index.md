---
schemaVersion: 1
id: mirrorn-contributing
name: MirrorN 贡献指南
summary: 从新建资源目录到本地校验、页面预览和 PR 审核的贡献流程。
category: document
tags:
  domain: [documentation]
  format: [text]
aliases: [贡献流程, PR 指南, gong xian zhi nan]
authors: [MirrorN]
publishedAt: 2026-10-07
draft: false
status: active
---

## 贡献什么

本站通过 Git 手工维护资源与文档。可以新增资源、补充用法、修订来源、说明兼容条件或标记已失效的入口；不需要管理员账号，不通过在线后台编辑。

一个资源是长期稳定的收录对象，不因文件格式、版本或平台变化就新建一个资源页。先检查已收录目录，已有资源优先修改原目录。

## 组织文件

在 `content/resources/` 下建立以稳定 ID 命名的目录：

```text
content/resources/your-resource/
  index.md
  sources.json
  assets/
```

`index.md` 包含 Front Matter 和正文。需要来源时添加 `sources.json`；只讲解知识的文档可以没有下载来源。图片或小型附件放 `assets/`，下载附件还要通过 Asset 和 local Source 声明。

:::notice{type="info" title="先熟悉写作语法"}
使用普通 Markdown 和站点指令，不在文章中手写组件或导入代码。下面的关联指南提供完整写法与离线速查。
:::

::resource-card{resource="mirrorn-markdown"}

## 从草稿到本地页面

写作时先设 `draft: true`。草稿也要满足身份、语法、字段类型和已有引用的校验，但不会生成公开页面。

```bash
pnpm content:check --include-drafts
```

准备公开预览时补齐简介、作者、发布日期、维护状态等发布字段，并明确设为 `draft: false`。然后执行：

```bash
pnpm content:check
pnpm typecheck
pnpm build
```

由贡献者手动启动本地开发或预览服务，在 `/resources/<id>/` 阅读实际页面。类型检查不是页面验收：还要确认下载来源、复制内容、键盘操作、窄屏布局以及禁用 JavaScript 后的基本阅读。

:::notice{type="warning" title="草稿集合不等于草稿页面"}
`--include-drafts` 只选择本地校验集合；当前网站没有草稿页面预览 UI。公开页面和附件始终来自公开 Registry。
:::

## 提交 PR

在项目实际 Git 仓库提交 PR，说明资源 ID、变更用途、来源依据、已做的检查和附件来源。站点配置中的贡献仓库入口尚未配置，不使用占位域名代替真实入口。

维护者审阅后合并。自动 CI 与正式部署配置仍属于后续开发阶段，不能把“已合并”理解成“已上线”；网站只有在静态构建与发布成功后才会更新。

## 后续维护

| 情况 | 处理方式 |
| --- | --- |
| 增加版本或文件格式 | 新增产物及来源，解释推荐版本 |
| 同一个文件增加入口 | 引用同一个 artifact，不复制一份文件元数据 |
| 某条来源失效 | 设置 health 为 broken 并填写 note，不自动下架整篇教程 |
| 不再推荐资源 | 设置 status 为 deprecated 并写 statusReason |
| 仅保留历史资料 | 设置 status 为 archived 并写原因 |
| 撤下资源 | 先解除其他公开文章的引用，再设 draft 为 true |
| 删除资源 | 删除目录并修正引用，Git 保留历史 |

:::notice{type="info" title="引用是发布单元的一部分"}
文档、来源、附件和跨资源引用必须一起校验。删除或撤下被其他公开文章引用的资源，会阻止构建；先修正这些引用再发布。
:::
