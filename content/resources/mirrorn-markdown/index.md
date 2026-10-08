---
schemaVersion: 1
id: mirrorn-markdown
name: MirrorN Markdown 编写指南
summary: 资源文件结构、元数据、下载来源与 Markdown 写作规则，附离线速查。
category: document
tags:
  domain: [web, documentation]
  platform: [any]
  format: [text]
  license: [CC-BY-4.0]
aliases: [文档编写指南, Markdown 写作, wen dang bian xie zhi nan]
authors: [MirrorN]
publishedAt: 2026-10-07
updatedAt: 2026-10-08
draft: false
status: active
defaultVersion: "1.1"
---

## 从一份 Markdown 开始

资源正文使用普通 Markdown，加上本站注册的指令。作者不用写 JSX、导入组件或为每篇文章编写交互代码。想看各样式的实际效果和写法，阅读组件参考；这份指南重点说明如何组织一篇资源文档。

::resource-card{resource="mirrorn-components"}

## 创建资源目录

在项目根目录运行，例如为新资源 `my-tool` 创建草稿：

```powershell
pnpm resource:new my-tool
```

命令不会覆盖已有目录。一个软件或一套学习资料使用稳定的资源 ID，不按每个版本另建页面。

```text
content/resources/my-tool/
  index.md
  sources.json
  assets/
```

`index.md` 放元数据和正文。需要下载、安装命令或其他获取入口时添加 `sources.json`；纯学习文档可以省略它。图片与小型附件放 `assets/`。

## 填写元数据

Front Matter 位于文档开头。公开资源需要名称、简介、分类、标签、作者、真实发布日期、维护状态，并明确设置 `draft: false`。

| 字段 | 如何填写 |
| --- | --- |
| `id` | 与目录名一致，创建后保持稳定 |
| `name` | 软件或资料的通用名称，作为页面标题 |
| `summary` | 简洁说明用途和本文提供什么，不写“最快”“绝对安全”等无依据承诺 |
| `category` | 选择一个主分类，如 `software` 或 `document` |
| `aliases` | 常用简称、别名和需要被搜索到的拼音 |
| `tags` | 平台、领域、资源形式等已知信息，不猜架构或许可 |
| `authors` | 实际贡献者的显示名或 GitHub handle |
| `updatedAt` | 修改内容时更新，不早于发布日期 |

首页搜索读取名称、简介、别名和标签，不搜索正文。中文名称需填写明确的拼音排序键 `sortKey`；搜索缩写和拼音也由贡献者维护，不自动猜测。

## 编写正文

正文从 `##` 二级标题开始，页面已有一个由 `name` 生成的一级标题。下载类资源建议按 **获取入口 → 安装／使用 → 常见问题 → 参考资料** 组织；学习文档按知识内容组织，不必套用软件安装模板。

普通 Markdown 支持段落、强调、列表、引用、链接、图片、GFM 表格、任务列表和脚注。代码块写明确语言，可加 `title="文件名"`；不认识的语言和参数会在内容检查中报错。

:::details{title="代码块写法"}
````markdown
```cpp title="hello.cpp"
#include <iostream>

int main() {
    std::cout << "Hello, World!\n";
    return 0;
}
```
````
:::

下载、提示、折叠等功能使用已注册指令，不在正文里写任意 HTML、CSS、JSX 或脚本。用于说明的源码放在围栏代码块里，仅展示，不执行。

## 维护下载与安装来源

**官方下载、镜像下载、本站文件、下载页面和安装命令是不同入口。** 文件按钮应直接指向文件，网页入口应明确写“访问页面”。有实际镜像才展示镜像，没有时不要用官网页面凑出镜像标签。

只有一个链接、不需要版本选择或校验值时，可以直接写：

```markdown
::download{url="https://github.com/HoloNova/MirrorN" target="page" label="打开项目仓库"}
```

有版本、平台筛选、校验值或多个来源时，在 `sources.json` 声明产物、来源和分组，再用稳定 ID 引用：

```markdown
::download{source="reference-markdown"}
::download-select{group="reference-files"}
::install-command{source="project-dependencies"}
```

上面是本指南已经登记的 ID。其他资源应改成自己登记的 ID，不能跨资源引用一个来源 ID。

同一字节文件可以有多个入口；不同版本、架构或封装需要不同产物。上游滚动通道会更换文件，不应填写无法保持一致的固定摘要，也不能把另一份镜像未经核对就归到同一产物下。

:::notice{type="note" title="状态是维护记录，不是实时测速"}
只有实际核查后才标为可用并填写核查日期。文件入口能打开，不代表已下载完整文件、验证安装或测试兼容；备注应写清范围。失效入口填写原因；没记录状态的来源不显示徽章，也不写成“未验证”。
:::

## 图片与本站附件

正文图片使用资源 `assets/` 内的相对路径。下载附件通过 Asset 和 local Source 声明，再用下载指令引用，不直接拼接产物路径。

当前单附件上限为 **5 MiB**，一个资源引用的附件总计不超过 **20 MiB**。大型安装包、模型或数据集使用实际外部来源；不要把它们放进 Git 资源附件。第三方文件应说明来源与许可。

## 下载离线速查

本站原创速查提供 Markdown 与纯文本 **1.1** 版，两种格式是两个不同产物。文档采用 CC BY 4.0，原创程序示例采用 MIT。

::download-select{group="reference-files"}
::checksum{artifact="reference-markdown-v1"}

在 PowerShell 中对比下载文件的 SHA256：

```powershell
Get-FileHash -Algorithm SHA256 .\mirrorn-markdown-reference.md
```

这里的本站附件摘要由构建链核对，不代表本站已经验证其他远程文件。

## 校验并贡献

写作时保留 `draft: true`，检查草稿：

```powershell
pnpm content:check --include-drafts
```

准备公开时补齐发布字段并设为 `draft: false`，再运行统一检查：

```powershell
pnpm check
```

草稿集合只用于内容校验，不会生成草稿页面。贡献者自行在本地查看公开资源页，检查正文、链接、复制和窄屏展示后提交 PR。

::resource-card{resource="mirrorn-contributing"}

## 参考资料

::source-list{group="reading-and-tools"}
