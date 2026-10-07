# 构建、发布与持续维护

> P7 已编写平台无关交付链，正式门禁与实际进度见 PLAN。域名和托管由用户明确后置，当前没有部署、没有推送，也不能声称 GitHub CI 或完整 PR→上线流程已运行。普通构建是 noindex 预览；正式构建有独立配置门槛，不创建过渡／UI 测试。

## 1. 命令职责

| 实际命令 | 职责 |
| --- | --- |
| pnpm dev | 本地预览新站，默认不公开草稿；显式本地预览选项才能查看草稿 |
| pnpm content:check | 已实现：校验全量资源结构、引用、附件与锚点；默认交付公开 Registry，不访问外网 |
| pnpm typecheck | React Router typegen＋tsc 检查 React／TypeScript 与契约类型 |
| pnpm lint | ESLint／TypeScript／TSX 检查新源码，不扫描归档与生成文件 |
| pnpm docs:check | 活跃工程 Markdown 的 UTF-8、文件与章节引用，不探测外链 |
| pnpm template:check | 直接校验长期模板，不创建临时资源 |
| pnpm resource:new ID | 创建 draft=true 的新资源，已有目录拒绝覆盖 |
| pnpm check | 文档→模板→lint→内容→类型→一次预览构建→产物门禁，失败即停止 |
| pnpm build | 生成 noindex 预览：公开 HTML、摘要附件、索引、字体、完整许可、禁止抓取的 robots 与 build-info；不生成生产 sitemap |
| pnpm build:release | 真实 HTTPS siteUrl＋干净 Git 修订通过后生成并检查正式产物；不执行部署 |
| pnpm check:dist | 检查本次产物内链、资源引用、草稿泄漏和归档污染 |
| pnpm preview | 本地预览实际生产产物，不重新引入草稿 |

`content:check --json` 输出摘要或结构化错误，不导出正文；`content:check --include-drafts` 只显式选择本地 preview 注册表，production 环境拒绝。dev 的资源文件变化会重新校验并刷新；正式 build 始终选择 public 模式。草稿页面 UI 尚未实现，`pnpm preview` 仍只展示已构建产物。

这些命令不能调用 archive 中的脚本。当前要求 Node 24 LTS ≥24.16.0（CI 24.18.0）、pnpm 12.8.1（`packageManager`）、dev 与 preview 默认端口 4321；不沿用旧双进程 dev.mjs。

## 2. 一次发布的内容集合

构建读取同一 Git 修订下的文档、JSON 和附件，生成一个完整不可变产物。产物含页面、搜索索引、下载附件、404、字体、完整许可、robots 与 build-info；只有正式模式包含 sitemap，不含数据库、原始凭据、归档、测试样本或草稿文件。

站点配置统一管理站名、正式 site URL、贡献仓库、默认分支和编辑路径。生产 canonical、OG URL、sitemap 需要真实 site URL；预览不能冒充正式站点，默认 noindex。

P1 当前只支持站点根路径部署，`siteUrl` 不能包含 `/docs/` 等子路径；仓库地址的真实路径不受此限制。未配置 `siteUrl` 的本地产物默认 noindex，404 始终 noindex 且不输出 canonical。`MIRRORN_BUILD_MODE` 只允许 preview／release，默认 preview，NODE_ENV 不决定公开索引。即使填写 siteUrl，普通构建和 PR CI 仍 noindex，无 canonical／og:url／生产 sitemap。`build:release` 显式选择 release；生产页面使用真实 canonical／OG 地址，404 仍 noindex，无 canonical。

资源 URL 是 `/resources/<id>/`，由静态托管支持目录索引。不存在路径返回真实 404，不用 SPA fallback 把所有失效路径都返回首页 200。

### P4 编辑入口与远端边界

贡献仓库已按 origin 核实为 `https://github.com/HoloNova/MirrorN`，默认分支按远端 HEAD 核实为 `main`，编辑链接仅指向平台编辑器，不使用站内账号、写仓库 Token 或自动提 PR。来源和附件的多文件修改在同一工作分支完成，主动提交一个 PR，审核中继续更新它。

当前远端 HEAD 仍为归档前基线，新文档尚未推送；静态构建只证明链接生成，不证明平台上已有这些文件。推送／发布仍需用户授权，首次公开发布前须确保文档和来源已在配置分支，并实际验证编辑入口。正式域名与托管配置由用户后置；许可证已确定为代码 MIT／原创文档 CC BY 4.0，详见 licensing。

### P3 附件输出契约

图片生成 `/resource-assets/<id>/<sha256>/image.<png|jpeg|webp|avif>`，其他附件生成同前缀下的 `file.bin`。更换字节会更换地址；只输出公开 Registry 实际引用的文件，不将整个 assets 或草稿目录复制到 public。实际读取发现大小／摘要变化会终止生成，须重新构建，不能冒充旧版本文件。

公开静态文件由交付层按 Registry 输出，开发读取与构建共用同一字节函数，部署不启用应用服务。开发中间件的响应头不保证自动成为托管商响应头。P7 指定实际主机后配置：图片按扩展名返回正确 MIME；`file.bin` 返回 application/octet-stream 和 Content-Disposition: attachment（不固定 filename，保留链接 download 指定的原始名称）；附件设置 nosniff 和摘要缓存。当前没有选择托管商，尚未生成这些主机配置。

### P5 搜索索引输出契约

首页与 `search-index/<sha256>.json` 共用公开 Registry 的稳定最小投影，内容改变会改变地址，完整产物同时替换；不手动覆盖旧摘要 URL 的字节。浏览器按需请求索引，做格式／重复 ID 校验，在 SubtleCrypto 可用时核对 SHA256；模块或索引超时／无效时显示手动重试及分类入口，没有服务端查询 API。

实际托管目标确定后必须落实 JSON 的 application/json; charset=utf-8、nosniff 与摘要长期缓存；端点 Response 头不代表静态主机已配置。HTML 及时再验证，不对 homepage/404 等文档使用不可变长期缓存。部署须保留同一版本的 HTML、动态 JS 块、索引及附件，禁止 SPA fallback 将缺失 JSON/模块返回首页 HTML。旧打开的页面在发布切换后可能请求旧摘要，按实际主机配置保留必要版本或明确失败引导重载；不能声称摘要地址消除了所有发布切换问题。

### P6 本地字体

两款 Fontsource 5.3.0 字体按 `styles/fonts.css` 引用的 Latin 子集打包为本地带摘要 WOFF2，CSS 与字体和 HTML 同一版本交付。字体使用 swap 和系统回退，不请求外部 CDN；实际静态主机在 P7 按扩展名返回 font/woff2 并采用摘要缓存。`public/font-licenses/inter.txt` 与 `jetbrains-mono.txt` 是包内原始版权和完整 OFL，随每次产物发布并从关于页可访问，不能只发布字体而漏掉许可。两份 OFL 与已经确定的项目 MIT／CC BY 4.0 区分。浏览器打包的 Fuse.js／Zod 完整许可也从锁定依赖生成，并校验原始字节。

## 3. CI 与审核

`.github/workflows/verify.yml`：冻结锁文件安装 → `pnpm check`（文档／模板／lint／内容／类型／一次静态构建／产物检查） → 保留 7 天 noindex 静态预览包，不发布网站。Node 24.18.0／pnpm 12.8.1，四个官方 Actions 均按已核实稳定标签固定到完整提交摘要，不执行旧 Compose 服务。

正式资源、源码、模板、依赖或配置修改执行完整新站门禁；仅工程说明 Markdown 修改运行 docs:check，未知范围保守全检查。scope 脚本使用经过校验的 SHA 与 NUL 分隔文件名，不把 PR 内容插入 shell。archive-only 不触发新站 CI。

不新增浏览器自动测试、UI 单元测试或付费外部验证。UI 验收由维护者本地启动浏览器，清单见 acceptance。

普通 PR 不获得生产部署凭据。不使用带密钥的特权流程执行外部贡献代码。自定义 Markdown 指令校验并不等于可以信任 PR 对构建脚本本身的修改；后者需要维护者代码审核。

主分支合并后生成可发布产物；启用实际生产自动发布之前，由维护者明确配置托管目标与凭据。构建失败不替换生产站点，不能把合并成功显示成发布成功。

## 4. 部署契约

只要求静态文件托管，不要求 Node 常驻服务。平台必须支持目录页面、真实 404、HTTPS、缓存设置和整份产物替换。具体供应商配置在首次部署时加入，不为一个尚未指定的云平台预建多套脚本。

以版本目录／发布产物为单位上传并校验，再切换当前版本。不能把新文件叠加覆盖到旧目录却不删除旧文件，否则下架页面和草稿附件会残留。

HTML、目录索引和构建指针使用可及时再验证的缓存；带内容摘要的 JS/CSS、搜索索引和附件可长期缓存。新 HTML 必须只引用同版本产物。下架或删除时按托管能力清除旧页面／旧入口缓存，并核对最终地址；已经被访客下载的副本无法撤回，不宣称物理抹除。

生产 robots 与 sitemap 只收录公开资源。预览发布如启用，应只含公开集合且 noindex；含草稿的预览仅在显式本地模式中使用。

## 5. 回退

每次成功发布记录对应 Git 修订、产物摘要、发布时间和上一份可用产物。发布失败保留上一版；内容事故优先切回经过确认的旧产物，随后通过修正 PR 前向修复。

回退是重新发布完整旧产物，不直接改数据库、修改线上散落的 JSON 或强制重写 Git 历史。执行回退前确认旧产物不会重新公开本次明确要求删除的内容；此类情况应发布修复产物而不是盲目回退。

常规至少保留当前与上一份可用产物。Git 保存源内容历史；托管平台上的构建缓存不是内容备份。小文件在 Git，未来如增加外部对象存储，必须另定文件版本与备份规则。

## 6. 首次公开发布门槛

以下属于实际发布条件；平台无关实现不等于这些条件已经通过。用户允许域名／托管后置，P7 发布部分和 P8 须继续落实：

- 实际 Git 贡献仓库与编辑链接可访问，不使用 example.com 占位。
- 正式域名／站点 URL 和静态托管目标明确，路径和缓存策略经过配置。
- 已按维护者授权选择代码 MIT／原创文档 CC BY 4.0；新增第三方文件仍须单独核对分发许可。
- 至少一份经过人工审核的真实资源完整走完流程，演示数据不计入真实收录。
- 核心验收条件完成，未完成项不伪装为已验收。
- 已记录上一版／初始空站回退办法，构建失败不会覆盖公开内容。

## 7. 持续维护

资源更新以 PR 为单位，记录来源依据与核查日期。定期按维护者实际精力人工抽查重点资源，不约定无人执行的自动健康 SLA。链接问题先判断限流、权限页与真实移除，再更改 health 或文档。

依赖升级与内容更新分开审查，重新验证涉及的解析／渲染边界。契约破坏性修改提升 schemaVersion 并迁移所有受影响内容。产品范围改变时先更新 MAIN、决策与 PLAN，不靠临时补丁悄悄恢复旧后台。

## 8. 平台无关产物门禁（P7）

`src/delivery/` 在 React Router buildEnd 为完整静态输出生成 build-info.json。临时构建在 .local/react-router-build，dist 不含服务端构建包、.vite 或 SPA fallback；404.html 从明确预渲染页面生成。HTML 与对应的 _.data／404.html.data 同版本部署，数据文件含公开页面 hydration 信息，不是在线查询接口；与 HTML 一样及时再验证，不使用长期不可变缓存。包含 schemaVersion、preview／release、正式地址或 null、Git commit／dirty、公开内容摘要、逐文件 path／size／SHA256 与 artifactHash；不写绝对路径、原始正文、凭据或时间戳。artifactHash 覆盖除自身之外的完整清单，避免自引用；同源修订与字节可复核。预览允许未提交工作区，必须显示 dirty=true；正式模式在构建前后检查干净修订，资源集合在构建过程中变化会阻断。Git 不可用时预览记录 null 并报告原因，不伪造提交号。

`check:dist` 对照当前公开 Registry 检查文件集合、逐文件字节、内容摘要、JSON 索引与首页绑定、实际附件、正文标题锚点和完整许可；HTML／CSS 用 parse5／PostCSS，JS 模块用 es-module-lexer，核对静态引用闭包，不打开页面或执行产物 JS。只允许固定页面、公开资源／摘要附件／本次索引、已登记许可、字体和 Vite 构建文件；额外来源文件、草稿页面、旧索引／附件、归档或私有数据会失败。检查 noindex／canonical／robots 与正式 sitemap 集合，不访问任何外链。React Router 模块清单通过固定赋值后的 JSON 解析，核对模块／CSS／预加载文件，框架内部清单分派在限定范围内兼容，不执行清单 JS，不宣称静态证明所有动态路径。本站变量动态 import 和新增 srcset 仍须显式扩展契约。

该门禁不代替人工检查外部链接、实际托管响应头、404 状态码或 UI 行为。摘要用于版本识别与字节复核，不是签名或信任来源证明。恢复旧产物时应核对旧清单和字节，不能用当前 Registry 强行验收旧内容。

发布仍以完整、已审核且通过门禁的版本目录为单位，切换前确认托管响应头和 HTTPS；保留当前／上一版以及各自 build-info。未选择托管目标，本轮没有供应商脚本、线上切换或实际回退记录。默认 CI 产物只用于下载后人工检查，不自动提供公网预览地址。
