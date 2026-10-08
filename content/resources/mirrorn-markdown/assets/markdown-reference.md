# MirrorN Markdown 离线速查

版本：1.1。MirrorN 原创文档，CC BY 4.0；原创程序示例 MIT。

## 文件与正文

每个资源使用 content/resources/<id>/index.md。产物、来源与附件声明放 sources.json，小型图片和附件放同目录 assets/。正文从 ## 开始，页面标题来自 name。

支持普通 Markdown、表格、任务列表、脚注和围栏代码；代码语言受白名单限制，可写 title="文件名"。不写可执行 HTML、JSX 或脚本，代码块只展示。

## 功能指令

```markdown
::download{source="source-id"}
::download{url="https://github.com/HoloNova/MirrorN" target="page" label="打开项目仓库"}
::download-select{group="group-id"}
::source-list{group="group-id"}
::install-command{source="source-id"}
::checksum{artifact="artifact-id"}
::compatibility-table{table="table-id"}
::resource-card{resource="mirrorn-contributing"}

:::notice{type="info" title="说明"}
普通 Markdown，不嵌套资源指令。
:::

::::choice{label="选择做法"}
:::option{label="做法一"}
第一种做法。
:::
:::option{label="做法二"}
第二种做法。
:::
::::

:::details{title="补充说明"}
这里可以放说明或代码块。
:::

:::steps
1. 第一步。
2. 第二步。
:::

正文说明[^ref]。

[^ref]: 补充来源。
```

source / group / artifact / table 使用本资源 sources.json 的真实 ID，resource 使用另一公开资源的 ID。download 的 source 与 url 二选一；url 写法必须有 label，target=page 是网页，默认 file 是文件。

notice 类型为 info / warning / danger / success / note。choice 内至少两个标签不重复的 option；外层冒号比内层多，各自等量闭合。steps 内必须是一个有序列表。option / details 不放标题或再嵌套 choice / option / details；脚注不放标题、指令或脚注引用。

## 来源与附件

官方下载、镜像下载、本站文件、网页与安装命令分别标明。只有相同字节文件可共用产物 ID；不同版本、平台、架构或封装分开声明。未核实的数据不编造；可用状态须有真实核查日期，入口可用不等于安装已验证。

滚动下载通道不填写固定文件摘要。本站附件通过 Asset 和 local Source 引用，单附件不超过 5 MiB，一个资源合计不超过 20 MiB。

## 校验与贡献

pnpm resource:new <id> 创建草稿，不覆盖原目录。
pnpm content:check --include-drafts 检查草稿，不生成草稿页面。
公开前补齐发布字段并设 draft: false，运行 pnpm check，再自行检查页面和提交 PR；合并不等于上线。

在线效果与折叠写法：/resources/mirrorn-components/
写作指南：/resources/mirrorn-markdown/
贡献流程：/resources/mirrorn-contributing/
