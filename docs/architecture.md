# 新站技术架构与模块地图

> 本文区分目标架构与已实现模块；P1 工程、P2 内容处理链与 P3 资源渲染模块已落地，其余阶段以 [PLAN.md](../PLAN.md) 为准。

## 1. 技术决策

| 层 | 选择 | 为什么存在 |
| --- | --- | --- |
| 页面构建 | Astro，纯静态输出 | 文档优先，预生成可直接访问的 HTML，不需要运行服务端应用 |
| 开发语言 | TypeScript | 内容契约、解析结果、交互数据共享类型 |
| 文档语法 | unified／remark-parse／remark-gfm／remark-directive | 扩展 Markdown 指令语法并生成 AST，不自写解析器，不要求作者写 MDX／JSX |
| 元数据 | YAML 解析＋Zod 校验 | Front Matter 与 JSON 数据边界统一验证，类型从 Schema 推导 |
| 渲染 | Astro 页面／组件＋受限文档 AST | 文档内容只能使用注册节点，不动态加载文档中的代码 |
| 浏览器交互 | 原生 TypeScript 小模块 | 搜索、选择器、复制、主题、目录高亮，不默认引入 React/Vue 应用运行时 |
| 搜索 | 构建生成 JSON 索引＋Fuse.js | 人工策划规模下只搜索结构化字段，浏览器按需加载，无数据库或服务接口 |
| 样式 | 语义 CSS Tokens＋组件样式 | 精确落实 MDN 参考，不继承旧 CSS，不引入额外 UI 框架 |
| 工具链 | Node.js 24 LTS＋pnpm 单包工程 | 当前工作站具备 Node 工具链；无需为一个静态站继续 monorepo |
| 验证 | 正式内容校验、类型与构建门禁 | P2／P3 按用户要求不做过渡测试；没有 UI 单元测试或自动浏览器 |

依赖具体版本在新工程阶段查询实际兼容版本并锁入新 lockfile；不复用归档 lockfile，也不在尚未安装时编造版本。Astro 自身能生成静态路由已经过官方文档核对；自定义指令由 remark-directive 解析，作者接口是 Markdown，组件实现只在站点源码中定义，不引入 MDX 编译执行链。

P1 实际锁定（写入 `pnpm-lock.yaml`）：Astro 7.3.6、TypeScript 6.0.3、@astrojs/check 0.9.10；工具链 Node 24.18.0、pnpm 12.8.1。`output: 'static'`、`astro/tsconfigs/strict` 与 dev／preview 默认端口 4321 按已安装版本的配置声明核对。

参考资料：
- [Astro 静态输出配置](https://docs.astro.build/en/reference/configuration-reference/#output)
- [Astro 静态动态路由](https://docs.astro.build/en/guides/routing/#static-ssg-mode)
- [remark-directive](https://github.com/remarkjs/remark-directive)
- [Markdown 指令语法](https://github.com/micromark/micromark-extension-directive#syntax)

P0 选型依据为官方文档的 Context7 检索结果；P1 已安装并运行上述锁定工具链，实际配置 API 另经 npm registry 元数据与已安装包的类型声明核对。P2 已锁定 unified 11.0.5、remark-parse 11.0.0、remark-gfm 4.0.1、remark-directive 4.0.0、remark-frontmatter 5.0.0、yaml 2.9.1、Zod 4.6.5、jsonc-parser 3.3.1、github-slugger 2.0.0、micromark-util-normalize-identifier 2.0.1 与 mdast-util-to-string 4.0.0。官方解析、GFM、源位置、标题文本和唯一锚点工具均复用成熟实现；Fuse.js 留到 P5。

## 2. 数据流

```text
content/resources/*/index.md + sources.json + assets
                         ↓
读取 → 解析 Front Matter / JSON / Markdown AST
                         ↓
Schema → 自定义指令注册与参数检查 → 引用检查 → 附件检查
                         ↓
全站资源注册表（内存中的类型化数据，不持久化数据库）
                         ↓
筛出公开资源，计算摘要、TOC、静态文件地址
                         ↓
       ┌─────────────────┼──────────────────┐
       ↓                 ↓                  ↓
资源 HTML / 附件     分类与首页搜索索引    sitemap / SEO
       └─────────────────┼──────────────────┘
                         ↓
                   单次构建产物 dist/
```

开发预览和正式构建共用处理链。开发时文件变化会刷新注册表；生产不扫描磁盘、不修改内容。内容错误阻止新的构建，已部署版本不受影响。

P2 默认输出公开 Registry；`content:check --include-drafts` 显式选择本地 preview 集合，production 环境拒绝此模式，正式构建集成固定选择 public。P3 公开附件已按 Registry 生成；草稿页面 UI、索引与社交元数据尚待对应阶段实现；以后页面预览须可见标识，不把“预览地址隐蔽”当成不公开保证。

## 3. 目标目录

```text
src/
  pages/                 # 基础页面、P3 公开资源文档与摘要附件静态端点
  layouts/               # SiteLayout、ResourceLayout（P1 已建：阅读宽度与标题插槽）
  components/
    site/                # 顶部导航、主题、目录等站点组件（P1 只建导航与主题）
    resource/            # 八资源组件、CopyBlock、SourceEntry、受限 AST 渲染器（P3 已建）
  content/
    categories.ts        # 八个主分类常量（P1 已建）
    schema/              # Front Matter、来源、产物、指令参数（P2 已建）
    parse/               # 文件读取、YAML/JSON、AST 限制（P2 已建）
    validate/            # 跨资源引用、公开性、附件、锚点（P2 已建）
    registry/            # 不可变 public／显式 preview 注册表（P2 已建）
    integration.ts       # CLI 同链构建门禁、dev 内容监听（P2 已建）
    render/              # 摘要附件实际读取和再核对（P3 已建；AST 渲染见 components/resource）
    resolve/             # 来源行为、附件地址与下载候选模型（P3 已建）
    search/              # 索引生成、排序与检索配置（待 P5）
  scripts/               # P3 复制／下载选择渐进增强，不读取服务器路径；搜索待 P5
  styles/                # tokens、base、prose（P1）；resource-components（P3）
content/resources/       # 唯一资源内容根（已收录两篇正式站内指南）
public/                  # 站点级受控静态文件，不放资源草稿附件（待实现）
scripts/                 # check-content.ts（P2 已建）；产物检查待 P7
config/                  # 站点名、域名、贡献仓库等非机密配置（P1 已建 site.ts）
.github/workflows/       # 新项目 CI，尚未创建
archive/legacy/          # 历史资料，不是 workspace
```

P1 在根目录另外新增：`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`（pnpm 记录构建脚本白名单与发布年龄例外）、`astro.config.ts`、`tsconfig.json`。P2 已创建内容 Schema、Parser、Validator、Registry、Astro 校验集成与正式 CLI。P3 已创建受限渲染器、Resolver、复制与选择器增强、资源文档和摘要附件静态端点。完整浏览体验、搜索和新 CI 尚未实现。

### P2 实际接口

`src/content/registry/load.ts` 的 `loadResourceRegistry(projectRoot, { siteUrl })` 默认返回 `ResourceRegistry<PublishedResource>`；显式 `{ mode: "preview" }` 才包含已校验草稿。方法每次读取并校验内容，不复用陈旧缓存。

公开对象包含 `metadata`、`data`（来源文件包）、受限 `document`／`headings`、实际引用的 `files` 和 `resourceReferences`；递归复制冻结，无原始文档代码、磁盘绝对路径或文件字节。`get(id)` 和 `referencesTo(id)` 只查询当前选定集合。每个文件记录相对路径、实际字节数、SHA256／SHA512 和格式；P3 已将附件解析为摘要 URL 并生成静态文件，不能把 path 直接当服务器 URL。

CLI 使用 Node 24 原生 TypeScript，不额外引入脚本 runner。Astro 在 dev／build 配置阶段调用相同 Registry 加载器；dev 监听内容根，串行合并变更、重新校验并刷新模块，出错报告明确位置。P3 的资源文档和附件端点已消费公开 Registry；当前已生成两篇正式站内指南及两个附件，目录也已消费公开 Registry 计数和名称卡片。P4 继续补全浏览体验。

### P3 实际接口

`resolveSource(resource, sourceId)` 返回 file／page／command 判别联合，`resolveGroup` 保留维护者的组内来源顺序。Resolver 只消费已校验公开对象，没有 fetch、自动版本探测或任意 URL 代理。`downloadChoices` 保留 artifact 数组顺序与明确 defaultVersion；缺省维度和“全部”是不同键，不把缺字段当通配。

`ResourceDocument.astro → DocumentNodes.astro → 八组件` 是唯一渲染入口。Astro.self 递归渲染受限节点，固定导入组件并按指令判别联合分派；不调用 set:html，不加载文档代码。代码与命令复用 CopyBlock，原始值作为转义后的 JSON 属性传给复制脚本，避免 HTML 把 CRLF 改为 LF；浏览器不执行任何命令。

`pages/resources/[id].astro` 只生成公开资源详情。`pages/resource-assets/[id]/[hash]/[file].ts` 使用相同公开 Registry 和 Astro 配置中的 root，列出实际引用文件并在读取时再次核对大小／SHA256；不根据请求参数拼任意磁盘路径。生产构建生成普通静态字节，不需要 Node 运行服务。图片用受控格式扩展名，其他文件固定 file.bin，原始下载名通过同源链接的 download 属性提供；静态托管的响应头约束见 delivery。

原生选择器只重建筛选项和所选下载链接，不请求服务器或自动打开链接。筛选后有多个文件必须重新选择；无可用来源时不改选其他 artifact。完整来源 details 在无 JS 时展开，有 JS 后仍能打开；复制控件仅脚本成功初始化后显示。

P3 已收录编写／贡献指南两篇正式站内文档，不生成临时样本；静态构建已处理八组件，用户已确认本轮功能验收。未覆盖状态仍须后续真实内容验收，UI／UX／样式优化后置；状态和人工清单见 PLAN／acceptance。

## 4. 模块边界

- 指令注册表集中定义语法名称、参数 Schema、引用规则和内部组件映射；作者写声明式 Markdown，不写组件标签或逐篇定义组件。
- Schema 是字段类型和默认值的唯一实现来源；浏览器不另写一份 ResourceSource interface 漂移。
- Parser 只负责语法与位置信息；Validator 处理字段及跨文件约束；Registry 输出页面可消费的数据。错误不能到页面才静默忽略。
- Resolver 是纯函数：给定已校验公开资源和来源 ID，返回文件链接、网页链接、命令或本站附件链接，不请求网络。
- 页面和组件不得直接读原始 JSON、拼接服务器路径或查 archive；只消费 Registry／Resolver 的结果。
- 搜索与目录使用同一公开集合，但生成适合各自用途的最小字段；不把完整正文、所有来源或草稿发给首页。
- 浏览器只负责交互状态，不能成为发布状态和来源数据的第二份存储。

## 5. 搜索和排序

索引包含 id、name、summary、category、aliases、tags 和 sortKey，关联稳定资源 URL。名称精确匹配优先于模糊结果；固定权重、阈值和 tie-break，避免输入相同却因构建环境而改变结果。

首页首次聚焦或输入时按需加载搜索模块与索引；加载中、失败可重试、空结果分别可见。查询可放入 `?q=` 以支持返回和分享。只在渲染时作文本处理，不把查询拼成 HTML。

索引 URL 随构建内容产生摘要，HTML 不指向旧版固定索引缓存。大规模分片或全文检索仅在实际索引体积和延迟证明需要时引入，不预建后端搜索服务。

## 6. 渐进增强

正文、分类展开、普通链接在关闭 JavaScript 时仍可使用。下载选择器必须提供可读的默认／完整文件链接替代视图，安装命令即使无法复制仍可选择文字。需要 JS 的搜索给出转到已收录目录的说明，不显示一个失效的输入框。

只给交互部分发送 JS；不把整个文档页包成客户端 SPA。禁止从用户文档加载远程脚本、动态执行 JSX 或执行安装命令。

## 7. 独立性与扩展缝隙

不引入 Hono、SQLite、Redis、BullMQ、旧共享包或旧 CSS。归档内容不能进入源码导入图、tsconfig include、资源发现、站点 sitemap 或构建产物。P1 已落实扫描边界：`tsconfig.json` 的 include 覆盖 `src/`、`config/`、正式 `scripts/` 与 `astro.config.ts`，Vite 文件监听忽略 `archive/`、`.local/`、`.pi/`，构建产物 `dist/` 只有新站页面与样式。

未来对象存储由 Asset Resolver 扩展；文集导航由明确的文集数据扩展；搜索规模增长由 Search 模块替换。只有需求发生才启用对应扩展，不建立目前无人使用的服务接口。
