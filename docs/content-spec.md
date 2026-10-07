# 资源文档与组件契约 v1

> 规范状态：P2 已实现 v1 Schema、受限 AST、指令注册／引用／文件校验与 Registry；P3 已实现组件渲染、摘要附件输出和最小公开资源详情接入，完整浏览体验留 P4。变更本契约需要同步实现、示例与迁移说明，不得静默改变旧字段含义。

## 1. 资源文件包

```text
content/resources/<id>/
  index.md       # Front Matter + 正文，必需
  sources.json    # 来源、产物、分组与附件元数据，无来源时可省略
  assets/        # 本资源的图片和小型附件，可选
```

`id` 在全站唯一，目录名必须与 Front Matter 一致。一个资源不因平台或版本分裂成多个页面。所有路径相对资源目录；不允许跨目录 `../`、绝对文件路径或符号链接逃逸。来源数据只使用 JSON，不同时维护等价 YAML 格式。

站点构建只扫描 `content/resources/`。`archive/`、测试样本、文档中的示例和本地备份不参与资源发现。

## 2. Front Matter

文件必须是有效 UTF-8。YAML 只接受 core 普通数据，拒绝重复键、自定义标签、锚点／别名、非有限数值和额外未知字段；YAML／JSON 数据嵌套最多 32 层，不执行变量或模板。JSON 不接受注释、尾逗号或重复键。必填指发布要求，草稿可缺发布字段，但必须有有效身份、类别、语法和引用。

| 字段 | 类型／约束 | 发布要求 |
| --- | --- | --- |
| schemaVersion | 整数，当前为 1 | 必填 |
| id | 小写 ASCII 字母、数字、单连字符；正则 `^[a-z0-9]+(?:-[a-z0-9]+)*$`，1–80 字符 | 必填，创建后稳定 |
| name | 去首尾空白字符串，1–120 字符 | 必填，作为页面 h1 |
| summary | 1–240 字符纯文本 | 必填，用于搜索和 SEO 默认描述 |
| category | MAIN 定义的八个 ID 之一 | 必填，单选 |
| tags | 下表定义的分组对象，各组字符串数组 | 必填，允许空对象 |
| aliases | 不重复的搜索别名数组 | 可选，默认空 |
| sortKey | ASCII 拼音／品牌排序读法，如 `zhong wen gong ju` | 名称以汉字开头时必填，其余可选 |
| authors | 贡献者显示名／GitHub handle 的非空数组 | 必填，不填写私人邮箱 |
| publishedAt | 真实日历日期 `YYYY-MM-DD` | 非草稿必填 |
| updatedAt | 真实日历日期，不早于 publishedAt | 可选，内容修订时更新 |
| draft | boolean，省略时默认 true | 公开必须显式 false |
| status | `active / deprecated / archived` | 必填，与 draft 独立 |
| statusReason | 1–1000 字符 | 非 active 必填 |
| official | 不含用户名／密码的 HTTP(S) URL | 可选，无官方站不伪造 |
| icon | 已登记的八个分类 ID，或资源 assets 内图片路径 | 可选，图标展示待后续 UI 阶段，不接受任意 HTML/SVG 脚本 |
| defaultVersion | 字符串，与产物中的 version 精确匹配 | 可选，不自动推断最新版本 |
| seo | 对象：可选 title、description、image | 可选，缺省取 name、summary |

`id` 就是稳定 URL 标识；v1 不额外引入可变化 slug。页面 h1 由 name 生成，正文从 h2 开始，拒绝正文第二个 h1。SEO 标题不改变页面名称。

不引入排序权重：已收录页承诺按名称／拼音排序，权重会破坏该约定。未来如增加独立推荐区，只在推荐区引入明确排序规则。

### 标签维度

| 组 | 值示例 | 约束 |
| --- | --- | --- |
| domain | ai、web、java、python、database | 小写稳定 slug，可由 PR 扩展 |
| platform | windows、linux、macos、android、ios、freebsd、web、any | 机器可读受控值 |
| arch | x64、arm64、x86、armv7、riscv64、wasm、any | 机器可读受控值 |
| origin | official、github、gitlab、gitee、community | 来源性质，不等于 sourceType |
| format | installer、binary、archive、image、text、notebook | 资源形式 |
| license | MIT、Apache-2.0、GPL-3.0-only、Freeware 等 | 优先 SPDX；只记录已核实信息 |

标签各组去重；未知平台和架构通过契约修改添加，不在文档中自由拼写。`any` 表示确实通用；未填写表示未知或不适用，不能互相替代。资源标签是概括，下载筛选以产物字段为准。项目原创文档许可与上游资源许可是两件事。

### 排序

构建时用 `sortKey ?? name` 归一化大小写和空白，按数字开头、A–Z、其他符号三组排序，组内使用固定英文自然排序；相同键再按 id 排序，保证输出稳定。中文 sortKey 必须包含明确读法，因此不依赖机器本地语言或自动多音字猜测。sortKey 可进入搜索索引，但用户常用缩写仍应写入 aliases。

### 首页搜索投影（P5 已实现）

搜索只读取公开资源的 name、aliases、summary、各维度 tags 值和可选 sortKey，不读取正文。名称精确匹配优先，其次精确别名，再按固定 Fuse 权重与稳定排序处理模糊匹配；分类用于结果展示。搜索统一归一化大小写、NFKC 与空白，不自动生成中文拼音，需要的读法由 aliases/sortKey 提供。例如 `aliases: [贡献流程, gong xian zhi nan]`；常用缩写也应明确收录。

索引包含 id／name／summary／category／aliases／扁平去重 tags／可选 sortKey，由公开 Registry 构建，不由贡献者单独维护。draft 不入索引；active／deprecated／archived 的公开资源仍可检索，详情保留维护状态说明。查询上限和索引预算见 architecture，格式版本与 Schema 共用。

## 3. sources.json

顶层结构：`schemaVersion: 1`，以及 `artifacts`、`sources`、`groups`、`assets`、`compatibility` 五个数组；省略数组按空数组处理。未知字段报错。每个分区内 ID 唯一，跨分区引用按字段语义解析，不用数组下标作为身份。

### 3.1 Artifact：具体产物

| 字段 | 说明 |
| --- | --- |
| id | 资源内唯一稳定标识 |
| label | 可读的产物名称 |
| version | 可选原始版本字符串，不强制 SemVer，不将 latest/LTS 伪造成具体版本 |
| platform / arch | 可选，使用上述受控值；缺失不代表 any |
| fileName / fileType | 可选，实际文件名／扩展格式 |
| fileSize | 可选，非负安全整数，单位字节 |
| checksum | 可选 `{ algorithm: "sha256"或"sha512", value: 十六进制字符串 }` |

SHA256 为 64 位十六进制、SHA512 为 128 位。不知道大小／校验值就省略，不填 0 或编造。大小为 0 只代表确实为零字节的文件。远程校验值仅作维护者提供的信息，不能展示为本站已下载验证。

相同 artifactId 下的来源必须提供相同字节产物，不只是相同版本号。不同封装、不同平台、重打包或哈希不同的文件必须使用不同 artifactId。

### 3.2 Source：获取入口

共同字段：`id`、`type`、`label` 必填；`note` 可选；`health` 为 `unknown / available / broken`，默认 unknown；`checkedAt` 为可选真实日期。健康状态由维护者明确记录，available 必须有 checkedAt，broken 必须有 note，不自动随一次网络错误修改。

| type | 必填专用字段 | 行为 |
| --- | --- | --- |
| direct | url、artifactId | 文件链接，显示“下载” |
| release | url、target；target 为 file 时另需 artifactId | target=file 下载资产；target=page 访问发布页 |
| repository | url、target；target 为 archive 时另需 artifactId | target=page 访问仓库；target=archive 下载源码包 |
| package-manager | packageManager、installCommand、shell | 展示安装命令并允许复制 |
| webpage | url | 访问下载页，不显示文件下载承诺 |
| mirror | url、target；target=file 时另需 artifactId | 下载镜像文件或访问镜像目录／页面 |
| local | assetId、artifactId | 下载本站静态附件 |
| external-storage | url、target；target=file 时另需 artifactId | 下载外部文件或访问存储页面 |

`target` 仅在表中允许的类型出现；release、mirror、external-storage 为 `file / page`，repository 为 `archive / page`。网页 target=page 不填写 artifactId，因为它不是该产物的字节入口。其他类型禁止无意义字段，避免 local 同时填写 url 和 assetId 等冲突。

所有外部 url 仅允许 HTTP(S)，不得包含用户名／密码或需要保密的访问凭据。package-manager 可选 url 指向包页面；packageManager 是工具名，shell 为 `bash / powershell / cmd / sh`。installCommand 作为不透明文本保留，包括合法的首尾空白和换行；不 trim、不解析执行、不自动拼接用户输入。多终端命令用多个 Source 表达。

broken 来源在列表中保留说明但不作为默认下载、不自动跳转。若所有来源均 broken，资源正文仍可阅读，组件给出无可用入口提示；不会把整个资源自动改为 deprecated。

### 3.3 Group：供组件引用的集合

字段为 `id`、`label`、`sourceIds` 非空数组、可选 `defaultSourceId`。引用必须存在、不得重复；默认来源必须属于本组且不是 broken。

DownloadSelect 使用产物的版本／平台／架构生成候选项，再列出同一 artifact 下的来源。不会为找可用链接悄悄切换版本或平台。若一个筛选维度为空，显示“未注明”，不当作通配。无候选时说明无匹配；多个结果必须让用户选择，不能下载数组第一项。

有 defaultVersion 时先使用它，否则按维护者的 artifact 数组顺序展示，不把字符串比较当版本推荐。相同产物来源顺序取 group.sourceIds，默认值只在对应产物内生效。浏览器平台检测最多是可见建议，不直接触发下载。

### 3.4 Asset：本站附件

字段为 `id`、`path`（相对资源目录、必须位于 assets 内）、`downloadName`、可选 `mediaType`。发布时确认文件存在，计算实际大小与 SHA256；关联 artifact 的已填大小／SHA256 如不一致则报错，已填 SHA512 也必须核对。

下载产物输出为包含内容摘要的静态路径，文档下载指令只引用 sourceId，再由 local Source 引用 assetId；不直接写下载文件的路径。图片及查看原图链接可用 `assets/` 或 `./assets/` 相对路径，其他本地下载使用 Source 和下载指令。只复制公开资源实际引用的图片／附件，草稿文件不能被整个 public 目录打包带出。

初始工程预算：单附件不超过 5 MiB，一个资源引用的本地附件总计不超过 20 MiB；Markdown 和 JSON 各不超过 1 MiB。P2 已按实际字节数执行这些预算，对声明或正文引用的同一路径去重；磁盘上未声明且未引用的文件不扫描、不输出。超出预算优先外链，确有需要再调整规范。常规本地图片使用 PNG/JPEG/WebP/AVIF，并核对文件头与扩展格式（不声称完成解码验证）；不接收同源 HTML/JS/SVG/CSS 文件扩展名或主动内容 MIME。所有读取路径要求大小写精确、普通文件，并拒绝符号链接／junction。其他小文件按下载附件处理。

### 3.5 Compatibility：兼容性表

字段为 `id` 和非空 `rows`；每行包含 `platform`、可选 `arch`、`support`（supported/unsupported/unknown）、可选 `version` 与 `note`。这是维护者提供的说明，不推导为已经执行兼容性测试。

## 4. Mirrorn Markdown 扩展语法

作者使用普通 `.md` 文件，加上站点定义的声明式指令。组件实现、导入与交互逻辑只存在于站点源码，文档不写 JSX，不逐篇实现组件，也不需要了解 Astro／React／Vue。

支持标题、段落、强调、列表、引用、链接、图片、围栏代码、行内代码、GFM 表格和分隔线。代码块中的字符原样展示；表格和代码在窄屏内滚动，不撑开整页。标题使用 github-slugger 生成稳定唯一锚点，同名标题加确定性后缀；`main-content` 为布局预留，同名正文标题会追加后缀。v1 不接受脚注等未登记节点；Markdown 嵌套最多 32 层、最多 50000 个节点。

### 指令写法

无正文的功能使用独立行叶子指令：

```markdown
::download{source="official-file"}
::download-select{group="installers"}
::source-list{group="upstream"}
::install-command{source="pip"}
::checksum{artifact="win-x64-1-0-0"}
::compatibility-table{table="supported-platforms"}
::resource-card{resource="another-tool"}
```

提示块使用容器指令，内部仍是 Markdown：

```markdown
:::notice{type="info" title="版本建议"}
推荐使用 **LTS** 版本。
:::
```

指令名为下表定义的小写 kebab-case，参数值统一写双引号字符串。v1 不支持行内指令、方括号 label、class/id 简写、任意样式属性或未知参数；Notice 之外的指令不接收正文，Notice 内不嵌套资源指令。数组和对象放 sources.json，不在 Markdown 中表达 JavaScript。

不接受原始 HTML／JSX 标签作为功能语法，`<Download />` 和 `options={[...]}` 不属于 v1。普通文本中的花括号不是可执行表达式；代码块中的 HTML／JS／JSX 示例仅按文字展示。导入、表达式、脚本或命令均不会因出现在文档中被执行。

解析使用 unified／remark-parse／remark-gfm／remark-directive 生成 Markdown AST，白名单注册表将指令映射为类型化功能节点，再交给统一组件渲染。不能把指令属性直接展开为 HTML 属性，不能以正则替换代替语法解析，不能使用 eval、动态 import、MDX 编译执行或浏览器模板编译。

校验未知名称、参数、节点类型、上下文和引用；对意图写成指令却格式不完整的独立行给出语法错误，不能因解析器回落成普通段落而静默发布。需要按解析器 token／源码位置补充格式检查，代码块和普通文字示例不误判。

错误报告包含资源 ID、相对文件、行／列和字段路径；缺失字段定位到最近父节点。正式 CLI 与 Vite／React Router dev／build 已使用同一处理链；页面预览 UI 与 CI 落地时复用该实现。Markdown 链接同样限制协议；站内资源和锚点必须能解析，不能只校验指令引用。

## 5. 自定义语法与可复用组件契约

以下八种功能属于完整首发目标。左侧语法是贡献者接口，右侧组件名是站点内部实现名，作者不写组件标签。每项通过统一注册表声明指令名、允许参数、校验和组件映射；改组件内部实现不要求重写所有文档。

| Markdown 指令 | 内部组件 | 参数 | 输出与限制 |
| --- | --- | --- | --- |
| `::download` | Download | `source` 必填，`label` 可选 | 单个文件入口；仅接受 file/archive/local 类型目标，网页与命令应使用其他指令 |
| `::download-select` | DownloadSelect | `group` 必填 | 在组内选择版本、平台、架构、同产物来源，再显式下载；组内必须都是文件入口 |
| `::source-list` | SourceList | `group` 必填 | 展示入口和真实类型；可混合文件、网页与命令，不伪装为等价下载 |
| `::install-command` | InstallCommand | `source` 必填 | 仅接受 package-manager；显示工具、终端、命令与复制反馈 |
| `:::notice` | Notice | `type` 必填，`title` 可选 | type 为 info/warning/danger/success；接收 Markdown 正文，不嵌套资源指令 |
| `::checksum` | Checksum | `artifact` 必填 | 读取校验算法和值并支持复制；缺少 checksum 阻止发布而不是显示空框 |
| `::compatibility-table` | CompatibilityTable | `table` 必填 | 引用本资源 compatibility 的表 ID |
| `::resource-card` | ResourceCard | `resource` 必填 | 引用另一公开资源，显示其名称并链接；无递归文档嵌入 |

同一参数在不同指令中保持含义稳定。来源 URL、文件路径、校验值、命令不在指令中再复制一份。resource-card 的目标为草稿／不存在时阻止发布；删除被引用资源前先修改引用。资源间互链允许，不递归渲染。

## 6. 完整最小示例

以下是规范示例，不是已收录内容；example.com 只说明数据形状。

`content/resources/example-tool/index.md`：

```markdown
---
schemaVersion: 1
id: example-tool
name: Example Tool
summary: 用于说明资源格式的示例工具。
category: software
tags:
  domain: [web]
  platform: [windows]
  arch: [x64]
aliases: [示例工具]
authors: [maintainer]
publishedAt: 2026-10-06
draft: false
status: active
defaultVersion: "1.0.0"
---

## 获取资源

::download-select{group="installers"}

:::notice{type="info"}
请按自己的平台选择文件。
:::

## 其他入口

::source-list{group="upstream"}
```

对应 `sources.json`：

```json
{
  "schemaVersion": 1,
  "artifacts": [
    {
      "id": "win-x64-1-0-0",
      "label": "Windows x64",
      "version": "1.0.0",
      "platform": "windows",
      "arch": "x64",
      "fileName": "example-tool-1.0.0.zip",
      "fileType": "zip"
    }
  ],
  "sources": [
    {
      "id": "official-file",
      "type": "direct",
      "label": "官方文件",
      "url": "https://example.com/example-tool-1.0.0.zip",
      "artifactId": "win-x64-1-0-0"
    },
    {
      "id": "official-page",
      "type": "webpage",
      "label": "官方下载页",
      "url": "https://example.com/downloads"
    }
  ],
  "groups": [
    {
      "id": "installers",
      "label": "安装文件",
      "sourceIds": ["official-file"]
    },
    {
      "id": "upstream",
      "label": "其他入口",
      "sourceIds": ["official-page"]
    }
  ]
}
```

## 7. 发布校验与状态变化

结构校验作用于所有资源；发布校验作用于非草稿及其引用闭包。草稿可缺简介、作者、发布日期、正文或完整来源，不可包含未知语法、重复 ID 和错误引用。非 document 分类发布至少需要一条字段完整的来源；document 可仅含有效正文，不强制拥有下载文件。已知 broken 来源仍是可记录的入口，不因全失效而删除教程。

发布阻断：重复资源 ID、目录不匹配、非法字段／分类、缺失必填、无效日期、错误哈希格式、未知指令、错误指令参数、缺失附件、引用不存在或草稿、站内断链和重复／无效标题锚点引用。

外链探测不是默认构建门禁。超时、403、限流只能成为人工核查线索；不得因为一次网络结果改正文或下架资源。格式有效也不代表链接内容已验证。

设 draft=true 后，下一次完整构建同时移除页面、分类、搜索、站点地图和专属附件。部署必须替换整份产物而不是只增量覆盖文件；旧 CDN 缓存的失效策略见交付文档。

## 8. 演进规则

增加字段先讨论是否属于身份、产物、入口、文档或展示，避免重复存储。向后不兼容的变更提升 schemaVersion，提供迁移说明和明确错误，不同时无限期维护多套解析器。组件视觉实现可以更新，但作者使用的指令名、参数和引用含义不能顺手改名。P6 的字体、主题、代码工具栏、表格、提示和下载控件由站点统一维护，不增加文档样式参数，不要求重写正文、来源或附件；复制原始字节和严格产物筛选保持原契约。

## 贡献模板与内容许可（P7）

新资源可用 `pnpm resource:new <id>` 从 templates/resource 创建草稿，已存在目录不会覆盖。长期模板自身由 template:check 校验，不是已收录内容；不得将模板写作说明设为公开。纯文档可没有来源，实际下载资源须填写真实数据并引用稳定 ID；模板没有伪造来源或默认作者。

新站原创文档默认 CC BY 4.0，原创程序示例 MIT；上游资源、引用资料和第三方附件另按原许可。tags.license 继续描述被介绍资源，不新增一个同名文档许可字段；各资源单独说明附件许可，完整规则见 [许可说明](licensing.md)。资源 metadata.seo 的可选 title／description／image 已接到页面分享元信息，不改变正文 name 与 h1；本地 image 仍通过已校验的摘要附件输出。
