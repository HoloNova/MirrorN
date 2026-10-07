# 新站技术架构与模块地图

> 当前前端为 React／TSX＋React Router 静态预渲染＋Vite。原 Astro 渲染层已替换，迁移待人工验收；历史阶段记录见 [PLAN.md](../PLAN.md)。资源 Markdown、内容契约和业务模型继续保留，不把构建通过等同于上线。

## 1. 技术决策

| 层 | 选择 | 为什么存在 |
| --- | --- | --- |
| 全站 UI | React 19.3.0＋TypeScript／TSX | 页面、布局、资源展示和交互采用维护者熟悉的同一种语法 |
| 路由与静态预渲染 | React Router 8.4.0，ssr=false＋显式 prerender | 每个公开地址生成完整 HTML，不发布运行时服务，不使用空壳 SPA |
| 构建 | Vite 8.3.3 | 统一开发、客户端资产打包及构建期渲染 |
| 文档 | unified／remark＋自定义指令 | 作者只写 Markdown，不写 JSX／MDX 或可执行代码 |
| 元数据 | YAML／严格 JSON＋Zod | 字段类型、默认值和验证规则来自同一 Schema |
| 搜索 | 摘要静态 JSON＋Fuse.js 7.5.0 | 保留最小公开索引与固定排序，按需加载检索引擎 |
| 样式 | CSS Tokens＋语义组件类 | 保留现有 MDN 风格，不在技术迁移中重设计视觉 |
| 交付 | Node 24＋pnpm，纯静态 dist | 内容、类型、产物字节和引用门禁，不依赖浏览器或常驻后端 |

Markdown 仅是资源正文输入格式。首页、已收录、关于、404、文章布局和八个资源组件都由 TSX 定义，能够独立优化 UI／UX。没有幕后 Astro 构建层，也没有 Astro 开发工具栏。

实际版本锁在 pnpm-lock.yaml。TypeScript 6.0.3、React Router 的 typegen 与 tsc 共同检查路由和源码；正式 CLI 继续使用 Node 24 原生 TypeScript。框架选型依据为官方静态预渲染文档及安装包声明，不自建 React 静态渲染框架。

参考：[React Router 预渲染](https://reactrouter.com/how-to/pre-rendering)、[React Router 静态部署](https://reactrouter.com/how-to/spa)、[remark-directive](https://github.com/remarkjs/remark-directive)。

## 2. 数据流

```text
content/resources/*/index.md + sources.json + assets
                       ↓
Parser → Schema／Validator → 不可变 public Registry
                       ↓
              构建期 .server 数据加载
                       ↓
React 页面／受限 AST → 完整 HTML＋公开页面 hydration 数据
                       ↓
静态附件／摘要搜索索引／字体／许可／robots／正式 sitemap
                       ↓
                 版本清单 → dist/
```

开发和构建共用内容处理链。内容变更在 Vite 中重新校验后刷新；错误包含资源、相对文件、行列和字段位置。生产只部署静态文件，不在访客请求中扫描 Git 或文件系统。

默认 Registry 仅含公开资源。`content:check --include-drafts` 显式交付本地 preview 集合，production 拒绝该模式；这不是草稿页面 UI。预渲染、目录、搜索、附件始终使用 public，不发布草稿。

## 3. 模块地图

```text
src/root.tsx             HTML 外壳、元信息、样式、主题首绘和错误边界
src/routes.ts            显式路由注册
src/routes/              首页、已收录、关于、资源页、404 的 TSX 页面
src/layouts/             ResourceLayout：左侧目录和正文阅读布局
src/components/site/     吸顶导航、主题、本页目录、搜索
src/components/resource/ 八组件、复制／来源、元信息、受限 AST 渲染器
src/hooks/               React 搜索状态和生命周期
src/scripts/search/      按需索引与模块加载，非 DOM 渲染器
src/content/site.server.ts 构建／开发的数据加载，禁止进入浏览器包
src/content/schema/      字段与指令契约
src/content/parse/       Markdown／JSON／YAML 解析及位置
src/content/validate/    引用、公开性、URL、锚点、附件校验
src/content/registry/    public／显式 preview 注册表
src/content/resolve/     来源行为、下载候选、附件 URL 的纯函数
src/content/search/      最小投影、摘要、查询归一化、Fuse 排序
src/content/integration.ts Vite 内容校验、监听与开发静态文件
src/delivery/            静态收口、版本清单、许可和引用门禁
src/styles/              fonts、tokens、base、prose、site、resource、search
content/resources/       唯一资源内容根
public/font-licenses/    两份字体原始 OFL
config/                  站点、发布模式、原始许可映射
scripts/                 正式校验、模板和发布 CLI
react-router.config.ts   公开页面预渲染及构建收口
vite.config.ts           构建插件、开发端口、监听边界
```

archive/legacy 是历史资料，不进入导入图、类型检查、内容发现、sitemap 或产物；.local 和 .pi 同样不参与公开构建。

## 4. 内容与资源展示边界

`loadResourceRegistry(root, { siteUrl })` 默认交付类型化、递归冻结的公开集合；get／referencesTo 仅查询所选集合。资源包含元信息、来源包、受限 document／headings、实际引用 files 和资源引用，无绝对磁盘路径或文件字节。

Parser 保留语法与位置，Validator 检查字段及跨文件约束，Registry 只输出校验结果。Schema 是字段类型和默认值的唯一来源，页面不维护第二份来源契约。

`ResourceDocument.tsx → DocumentNodes.tsx → 八组件` 是唯一资源正文渲染入口。React 递归映射受限节点，不动态编译文档、不注入原始 HTML、不加载作者代码。只有固定的本站主题首绘脚本使用原始脚本注入，与文档内容隔离。

Resolver 保留 file／page／command 判别联合；没有 fetch、自动版本探测或任意 URL 代理。下载选择器只筛选同一组内的明确产物，不跨版本／平台回退，多匹配要求选择文件；broken 来源不提供操作入口。React 状态控制筛选与反馈，命令复制直接使用原始字符串，保留 CRLF 和首尾空白，不执行命令。

附件继续使用 `/resource-assets/<id>/<sha256>/image.<格式>` 或 file.bin。只读取公开 Registry 实际引用文件，再核对大小／摘要；不按 URL 拼任意磁盘路径，不复制整个 assets 目录。

## 5. 阅读、导航与 UI

ResourceLayout 和 PageToc 使用 document.headings 的同一组标题 ID。目录按正文实际位置追踪、aria-current 高亮，处理滚动、hash、尺寸及历史恢复；不改变正文焦点或 URL。宽屏目录在左侧，窄屏为正文顶部原生 details，少于两项不生成空目录。

SiteHeader 始终吸顶；ResizeObserver 测量真实高度并更新共用 --anchor-offset。三个 Tab 单行常显，空间不足只在导航区横向滑动，禁止汉堡菜单。已移除层级面包屑，不恢复与主导航重复的入口。

React 组件负责主题、复制、下载选择、分类定位和目录生命周期；监听、定时器、观察器与请求在卸载时清理。样式统一从 root 引入，原组件样式迁为带组件边界的 site.css，避免全局选择器影响其他页面。

编辑入口仅跳转 GitHub 对应文件的编辑器，不自动提 PR、没有站内账号或仓库写入服务。repositoryUrl 为 HoloNova/MirrorN、defaultBranch 为 main；远端文件尚未推送，不能以链接生成证明在线编辑可用。

## 6. 搜索与渐进增强

首页仍不默认堆资源卡片，已收录页仍不放搜索框。`createSearchSnapshot(publicRegistry)` 只投影 id、name、summary、category、aliases、tags、sortKey，再生成 SHA256 地址；不向首页交付完整正文、来源、附件或草稿。资源页的 hydration 数据仅消费本页公开内容和关联名称，不下发全站 Registry。

engine 保留名称精确命中、别名精确命中优先，再按固定 Fuse 权重、分数、归一化排序键和 ID 稳定排序，最多 20 条；拼音由作者显式填写。预算仍为查询 240 字符、索引 2 MiB、加载 10 秒、输入合并 150ms。

useResourceSearch 管理查询、输入法、键盘选择、q 恢复、加载和重试；load.ts 保留同源摘要地址、Schema、超时和可用时的 SubtleCrypto 校验。模块加载失败提供刷新入口。结果由 React 文本节点呈现，不把用户查询拼成 HTML。

每页预生成完整内容，而非只生成客户端挂载点。无 JS 时普通链接、正文、目录、分类和完整来源仍可用；复制／交互筛选／搜索控件只在 hydration 后启用，搜索保留目录回退。React 客户端运行时随页面加载，这是统一 React UI 的明确成本；不再声称仅给少数孤岛发送 JS。

## 7. 静态交付与发布边界

React Router 临时构建写到 .local/react-router-build。buildEnd 校验构建前后的内容摘要与正式源码修订，然后只将客户端静态输出收口到 dist；转换 404.html，移除 .vite、服务端构建包和 SPA fallback。HTML 与 _.data 必须同版本部署；数据文件不是在线 API，不能长期不可变缓存。

普通 build／PR CI 默认 preview：noindex、无 canonical／og:url／生产 sitemap。release 需要真实 HTTPS 根地址和干净已提交修订；sitemap 库只生成公开页面集合，不包含 404。根路径部署约束保留。

固定映射输出完整 MIT、CC BY、Fuse、Zod、React、React DOM、React Router 和字体许可并核对原字节。build-info 记录修订、dirty、公开内容摘要、文件 SHA256 和完整产物摘要，不是签名。

产物门禁检查 HTML／CSS／ESM 引用及框架模块清单：只解析固定 JSON 赋值、不执行生成代码；框架内部按清单导入作限定兼容，本站任意变量 import 仍报错。这不是对所有运行时路径的静态证明。

只部署静态文件，未知地址的真实 HTTP 404、JSON／附件 MIME、缓存和整份发布／回退由后续托管配置落实。开发预览不证明这些生产条件通过。CI 仍只有校验和 noindex 产物，没有自动部署权限。
