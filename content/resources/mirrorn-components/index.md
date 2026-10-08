---
schemaVersion: 1
id: mirrorn-components
name: MirrorN Markdown 样式与组件参考
summary: 展示已注册的 Markdown 样式与组件效果，附可折叠的写法、参数说明和源码位置。
category: document
tags:
  domain: [web, documentation]
  format: [text]
  license: [CC-BY-4.0]
aliases: [组件使用指南, Markdown 样式, 样式参考, 指令参考, zu jian can kao]
authors: [MirrorN]
publishedAt: 2026-10-08
draft: false
status: active
sortKey: mirrorn markdown components
---

## 如何使用这份参考

下面的效果都使用站点现有注册表和渲染器。每节先展示实际效果，再将写法放进“查看写法”折叠块。复制后应把来源、分组、产物或资源 ID 换成目标文档自己的真实声明，不需要导入组件。

本页的下载示例是本站原创 `hello.cpp`，采用 MIT；不是第三方安装包。所有示例代码仅展示，复制或安装命令都不会由本站执行。

## 普通 Markdown

**重点文字**、*强调*、~~删除线~~ 和 `行内代码` 使用普通 Markdown。

> 引用适合补充来源或原文，不替代下载按钮。

- 无序列表用于并列说明。
- [编写指南](/resources/mirrorn-markdown/)说明文件组织与来源规则。

| 内容 | 建议用途 |
| --- | --- |
| 普通表格 | 简短参数或选项对比 |
| 步骤 | 有先后顺序的操作 |

- [x] 已准备真实来源。
- [ ] 在本地检查页面。

:::details{title="查看普通 Markdown 写法"}
```markdown
**重点文字**、*强调*、~~删除线~~ 和 `行内代码`。

> 引用内容。

- 列表项。
- [编写指南](/resources/mirrorn-markdown/)

| 内容 | 建议用途 |
| --- | --- |
| 普通表格 | 简短参数或选项对比 |

- [x] 已准备真实来源。
- [ ] 在本地检查页面。
```
正文标题从 `##` 开始。图片用 `![说明](assets/文件名.png)` 引用真实本地图片；图片需满足格式与附件校验，不接受任意 HTML 标签。
:::

## 代码框

围栏代码自动使用统一工具栏与构建时语法高亮。可填写文件名，复制按钮复制源码，不包含工具栏标题。

```cpp title="hello.cpp"
#include <iostream>

int main() {
    std::cout << "Hello, World!\n";
    return 0;
}
```

:::details{title="查看代码框写法"}
````markdown
```cpp title="hello.cpp"
#include <iostream>

int main() {
    std::cout << "Hello, World!\n";
    return 0;
}
```
````
语言名使用白名单中的名称，例如 `cpp`、`c`、`powershell`、`bash`、`json`、`tsx`、`markdown`；省略时按纯文本。`title` 可省略，其他代码块参数不支持。完整语言及别名见 `src/content/schema/code-blocks.ts`。
:::

## 提示块：notice

:::notice{type="info" title="信息"}
解释当前操作或提供阅读方向。
:::

:::notice{type="warning" title="注意"}
执行前应确认平台、版本与课程要求。
:::

:::notice{type="danger" title="错误或风险"}
用于确实需要停止操作的情况，不将普通补充说明标成危险。
:::

:::notice{type="success" title="成功说明"}
用于有事实依据的成功条件，不把示例展示冒充安装已验证。
:::

:::notice{type="note" title="补充"}
中性备注采用灰色样式。
:::

::::details{title="查看提示块写法"}
```markdown
:::notice{type="info" title="信息"}
这里可以写 **普通 Markdown**。
:::
```
`type` 必填，可选 `info / warning / danger / success / note`；`title` 可省略。提示块内部不能嵌套资源指令。
::::

## 单个入口：download

使用 `source` 下载本页登记的原创源码：

::download{source="hello-local" label="下载 hello.cpp"}

只放一个网页入口也可直接写 `url`：

::download{url="https://github.com/HoloNova/MirrorN" target="page" label="打开项目仓库"}

:::details{title="查看下载入口写法"}
```markdown
::download{source="hello-local" label="下载 hello.cpp"}
::download{url="https://github.com/HoloNova/MirrorN" target="page" label="打开项目仓库"}
```
`source` 与 `url` 二选一。`source` 引用本资源 `sources.json` 中的文件来源；`url` 写法必须有 `label`，`target="page"` 表示访问网页，默认 `file` 表示文件下载。

直接写 URL 时，可用 `status="available"` 加 `checked="YYYY-MM-DD"` 记录实际核查，或 `status="broken"` 加 `note` 记录失效原因；不填就不显示状态徽章。使用 `source` 时，状态在来源数据中维护，而不是重复写在指令上。
:::

## 文件选择：download-select

选择器从来源分组读取产物、平台和架构。本页只有一个通用源码文件，因此不人为造出版本或平台选项；多个真实产物会增加相应筛选。

::download-select{group="example-files"}

:::details{title="查看文件选择写法"}
```markdown
::download-select{group="example-files"}
```
`group` 必填，分组内必须都是文件入口。选择器不会为了下载成功而悄悄切换版本、架构或封装；不同文件应声明不同产物，只有相同字节文件才能共用产物 ID。
:::

## 来源列表：source-list

来源列表可以混合本站文件、网页和安装命令，并分别标明其行为。

::source-list{group="reference-sources"}

:::details{title="查看来源列表写法"}
```markdown
::source-list{group="reference-sources"}
```
`group` 引用本资源分组。标签应写清来源或用途，网页入口不能冒充文件下载。
:::

## 命令框：install-command

下面是贡献者在项目根目录安装锁文件依赖的命令，按钮只负责复制。

::install-command{source="project-dependencies"}

:::details{title="查看命令框写法"}
```markdown
::install-command{source="project-dependencies"}
```
对应来源必须是 `package-manager`，包括 `packageManager`、`installCommand` 和 `shell`。命令与首尾空白来自来源数据，不由站点拼接或执行。
:::

## 选项切换：choice / option

适合由作者组织不同获取方式或不同平台说明，不替代按来源数据筛选文件的下载选择器。

::::choice{label="选择阅读方式"}
:::option{label="下载源码"}
::download{source="hello-local" label="下载 hello.cpp"}
:::
:::option{label="阅读写作指南"}
使用编写指南了解文件结构和来源声明。

::resource-card{resource="mirrorn-markdown"}
:::
::::

:::::details{title="查看选项切换写法"}
```markdown
::::choice{label="选择阅读方式"}
:::option{label="下载源码"}
::download{source="hello-local" label="下载 hello.cpp"}
:::
:::option{label="阅读写作指南"}
::resource-card{resource="mirrorn-markdown"}
:::
::::
```
外层冒号比内层多，且各自以相同数量的冒号闭合。`choice` 的 `label` 与每个 `option` 的 `label` 都必填；至少两个选项，标签不能重复。`option` 只能放在 `choice` 内。

选项内可放普通 Markdown、叶子指令、提示块和步骤；不放标题，也不再嵌套 `choice / option / details`。关闭 JavaScript 时所有选项会依次显示。
:::::

## 折叠块：details

:::details{title="展开补充说明"}
这里可以放较长说明、日志或围栏代码，不需要新增组件来折叠代码。

```text title="日志示意"
读取内容 → 校验 → 生成静态页面
```
:::

::::details{title="查看折叠块写法"}
````markdown
:::details{title="展开补充说明"}
这里可以写补充内容。

```text title="日志示意"
读取内容 → 校验 → 生成静态页面
```
:::
````
`title` 必填。默认收起，原生折叠在关闭 JavaScript 时仍可操作。内部不能放标题或再次嵌套选项／折叠块，避免本页目录指向隐藏章节。
::::

## 操作步骤：steps

:::steps
1. 在已收录目录中查找资源。
2. 阅读文件版本与平台说明。
3. 使用对应的下载入口或安装命令。
:::

::::details{title="查看步骤写法"}
```markdown
:::steps
1. 查找资源。
2. 确认平台与版本。
3. 获取文件。
:::
```
没有参数，内部必须是一个有序列表；步骤项可以放叶子指令，不把无序说明伪装成操作顺序。
::::

## 文件摘要：checksum

下面显示的是本页原创 `hello.cpp` 的实际 SHA256，可与下载文件对比。

::checksum{artifact="hello-cpp"}

:::details{title="查看校验值写法"}
```markdown
::checksum{artifact="hello-cpp"}
```
产物必须已经填写有效的 `checksum`，没有时会阻止发布。本站附件在构建时核对实际字节；远程文件提供的摘要不代表本站已下载验证。
:::

## 兼容条件：compatibility-table

本页示例附件是 UTF-8 源码，表格只说明文件阅读方式，不声称已经在各平台编译运行。

::compatibility-table{table="source-reading"}

:::details{title="查看兼容表写法"}
```markdown
::compatibility-table{table="source-reading"}
```
`table` 引用本资源 `compatibility` 的表 ID。每行声明平台、可选架构与 `supported / unsupported / unknown`，用备注写清条件与核查范围，不自动推断兼容。
:::

## 关联资源：resource-card

::resource-card{resource="mirrorn-contributing"}

:::details{title="查看关联资源写法"}
```markdown
::resource-card{resource="mirrorn-contributing"}
```
引用另一篇已经公开的资源，只展示名称链接，不递归嵌入正文；不存在或草稿资源会使内容校验失败。
:::

## 脚注

正文可以引用补充来源或限制条件[^component-reference]，说明统一显示在文末并可返回。

:::details{title="查看脚注写法"}
```markdown
正文中的说明[^reference]。

[^reference]: 补充资料或来源说明。
```
引用与定义必须成对，编号按首次引用顺序生成。脚注里不能嵌套指令、标题或脚注引用。
:::

## 源码与扩展入口

| 功能 | 实现位置 |
| --- | --- |
| 指令名称、参数与组件映射 | `src/content/schema/directives.ts` |
| AST 到组件的分派 | `src/components/resource/DocumentNodes.tsx` |
| 下载、提示、选项、命令等 React 组件 | `src/components/resource/` |
| 普通 Markdown 排版 | `src/styles/prose.css` |
| 资源组件与代码框样式 | `src/styles/resource-components.css` |
| 主题与间距 Token | `src/styles/tokens.css` |

新增样式或功能时同步内容规范和本页示例；不要只改这份参考就宣称新指令已经可用。开发流程见贡献指南。

[^component-reference]: 本页只展示已经注册的功能，文档不执行 HTML、JSX 或脚本；新增指令需要同时实现注册、校验和渲染。
