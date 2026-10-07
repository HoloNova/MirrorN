# MirrorN Markdown 离线速查

版本：1.0。本文由 MirrorN 为本站资源贡献者编写。

## 文件组织

每个资源使用 content/resources/<id>/index.md。来源、产物和附件声明放 sources.json，小文件放同目录 assets/。

## 正文

页面标题来自 Front Matter 的 name；正文从二级标题开始。支持普通 Markdown、GFM 表格、任务列表、代码块和本资源图片。

## 自定义指令

```markdown
::download{source="source-id"}
::download-select{group="group-id"}
::source-list{group="group-id"}
::install-command{source="source-id"}
::checksum{artifact="artifact-id"}
::compatibility-table{table="table-id"}
::resource-card{resource="other-resource-id"}

:::notice{type="info" title="说明"}
这里可以写普通 Markdown。
:::
```

ID 是对 sources.json 或其他资源的引用，不是直接写下载地址。上面的 ID 说明参数含义，使用时换成真实声明。

## 来源规则

文件、网页和安装命令是不同入口。同一字节产物可有多个来源；不同版本、平台、架构或封装要使用不同产物。

## 校验和发布

先运行 pnpm content:check，再运行 pnpm typecheck 和 pnpm build。draft: true 不生成公开页面；准备发布时设为 false 并补齐发布字段。

不写 JSX 标签、脚本或任意 HTML。代码示例放代码块，本站只展示，不执行。
