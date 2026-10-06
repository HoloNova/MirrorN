# 新站技术架构与模块地图

> 本文描述确定的目标架构，不代表目录或依赖已经创建。实际状态以 [PLAN.md](../PLAN.md) 为准。

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
| 单元验证 | 定向纯函数测试 | 只验证解析、契约、引用、索引和文件解析等逻辑，不写 UI 单元测试 |

依赖具体版本在新工程阶段查询实际兼容版本并锁入新 lockfile；不复用归档 lockfile，也不在尚未安装时编造版本。Astro 自身能生成静态路由已经过官方文档核对；自定义指令由 remark-directive 解析，作者接口是 Markdown，组件实现只在站点源码中定义，不引入 MDX 编译执行链。

参考资料：
- [Astro 静态输出配置](https://docs.astro.build/en/reference/configuration-reference/#output)
- [Astro 静态动态路由](https://docs.astro.build/en/guides/routing/#static-ssg-mode)
- [remark-directive](https://github.com/remarkjs/remark-directive)
- [Markdown 指令语法](https://github.com/micromark/micromark-extension-directive#syntax)

资料核对使用官方文档的 Context7 检索结果，不宣称已安装或运行这些依赖。

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

草稿可在显式开启的本地预览模式中查看，但生产构建不允许开启该模式，也不输出草稿索引、附件或社交分享元数据。预览标识必须可见，不能把“预览地址隐蔽”当成不公开的保证。

## 3. 目标目录

```text
src/
  pages/                 # 首页、已收录、关于、资源路由、404
  layouts/               # SiteLayout、ResourceLayout
  components/
    site/                # 顶部导航、主题、目录等站点组件
    resource/            # 八个资源组件的共享展示实现
  content/
    schema/              # Front Matter、来源、产物、指令参数
    parse/               # 文件读取、YAML/JSON、AST 限制
    validate/            # 跨资源引用、公开性、附件、锚点
    registry/            # 将验证结果转成公开资源注册表
    render/              # 指令统一注册表与受限 AST 到共享组件的映射
    resolve/             # sourceId/assetId 到真实行为与地址
    search/              # 索引生成、排序与检索配置
  scripts/               # 浏览器渐进增强，不读取服务器路径
  styles/                # tokens、base、layout、prose、components
content/resources/       # 唯一资源内容根
public/                  # 站点级受控静态文件，不放资源草稿附件
scripts/                 # 内容验证、构建编排、产物检查
config/                  # 站点名、域名、贡献仓库等非机密配置
.github/workflows/       # 新项目 CI，尚未创建
archive/legacy/          # 历史资料，不是 workspace
```

当前实际存在的是规范文档和 archive；上面各新业务目录都属于待实现。

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

不引入 Hono、SQLite、Redis、BullMQ、旧共享包或旧 CSS。归档内容不能进入源码导入图、tsconfig include、资源发现、站点 sitemap 或构建产物。

未来对象存储由 Asset Resolver 扩展；文集导航由明确的文集数据扩展；搜索规模增长由 Search 模块替换。只有需求发生才启用对应扩展，不建立目前无人使用的服务接口。
