# 贡献 MirrorN

MirrorN 的内容以 Git 为唯一事实来源。欢迎通过 PR 增加开发资源和学习文档、维护下载直链与镜像入口、补充兼容性说明，也欢迎开发或优化 Markdown 展示组件。不需要管理员账号，也没有在线内容管理后台。

> 可用命令见 README，实际阶段与发布状态见 PLAN。内容与组件参考是长期维护的公开文档；草稿 Registry 只用于校验，不是草稿页面预览 UI。

## 1. 内容贡献流程

1. 在已收录内容中检查是否已有相同资源；同一资源优先修改现有目录，不按每个版本新建页面。
2. 运行 `pnpm resource:new <id>` 从[长期模板](templates/README.md)创建草稿（不会覆盖现有目录），在 `content/resources/<id>/` 编写 `index.md`，需要来源时添加 `sources.json`，小型图片／附件放 `assets/`。通过 `::download-select{group="installers"}` 等自定义 Markdown 指令引用功能，组件由站点实现，不在文档中写 JSX／组件标签。
3. 按 [内容规范](docs/content-spec.md) 填写身份、简介、分类、标签、作者、维护状态和来源；正文解释用途、适用条件与操作，不搬运无关库存。
4. 新内容先保持 draft=true。填写完成后显式设为 false，并填写发布日期；代码示例和模板中的 example.com 必须替换为真实来源。
5. 运行 `pnpm content:check`，修正文件／行列／字段指向的问题，完成后运行 `pnpm check`，统一执行文档／模板／内容／lint／类型／构建／产物检查。目前可用 `pnpm content:check --include-drafts` 显式查看本地草稿集合；已公开资源可在本地 `/resources/<id>/` 查看页面，草稿页面 UI 仍未实现。修改现有资源时修正跨资源及锚点引用。
6. 提交 PR，说明增加／修改了什么、来源依据、手动核查范围和附件许可。不要声称没有验证的文件已校验或兼容。
7. 维护者审核结构、内容和来源，CI 校验通过后合并。合并不等于已经上线；只有静态构建与发布成功才会更新公开站点。

贡献者自己操作 Git 按项目流程提交 PR；本会话中的 Agent 仍必须遵守 AGENTS 中未经用户许可不得提交／推送的规则。

站内流程见 `/resources/mirrorn-contributing/`，文件与来源写作见 `/resources/mirrorn-markdown/`，实际样式、折叠写法与源码位置见 `/resources/mirrorn-components/`。三篇职责分开，均为长期维护内容。

### 搜索信息维护

首页索引由公开 Front Matter 生成，不手动修改 dist 或维护第二份数据。使用 name／summary／aliases／tags 和可选 sortKey 搜索；拼音和缩写由贡献者明确写入 aliases 或 sortKey，不自动猜读音。发布后可在 `/?q=<查询>` 检查名称、别名及拼音；草稿不生成公开搜索结果，已收录页没有搜索框。

### 编辑此页与 PR 粒度

资源页的「编辑此页（GitHub）」打开对应 `index.md` 的平台编辑器，不由本站保存内容或自动新建 PR。按 GitHub 提示在自己的工作分支完成修改，准备好后主动创建 PR；如果任务还需要改 `sources.json` 或附件，也放在同一分支。审核期间继续提交到已有 PR 的分支，不为每次保存另建 PR；不同任务则保持可独立审阅，不凑成巨型 PR。

本地页面有编辑链接不代表对应修订已在 GitHub；新增资源须推送对应文件，平台编辑入口才能使用。平台账号与权限由 GitHub 处理，MirrorN 没有站内登录。

## 2. PR 应提供的信息

- 资源 ID，变更类型：新增、修订、来源修复、废弃、归档、下架或删除。
- 上游官方网站／仓库与来源依据，推荐版本或用法的理由。
- 校验与预览结果；未完成项应明确标注，不以空白或猜测代替。
- 新附件的来源、许可、体积和用途；不能提交密钥、账号数据、私密下载凭据或旧数据库。
- 涉及文档格式、组件 API、分类值域时，说明兼容性和现有资源的迁移方式。

## 3. 日常维护动作

| 需求 | 修改方式 |
| --- | --- |
| 更新版本 | 增加／更新 artifact 与 source，调整 defaultVersion，说明推荐依据 |
| 更换镜像 | 同一文件增加 source；不是相同字节产物就新增 artifact |
| 来源失效 | health=broken，填写 note 与核查日期，保留其他来源 |
| 资源不再推荐 | status=deprecated，填写 statusReason，正文给替代建议 |
| 只作历史资料 | status=archived，填写原因，仍允许阅读和检索 |
| 暂时撤下页面 | draft=true，先解除其他公开文档对它的引用 |
| 永久移除 | 删除资源目录并修正引用；Git 保留历史，发布后旧地址返回 404 |

不得因为单次请求超时直接批量下架。改正文时更新 updatedAt；作者列表可追加实际贡献者，不把 CI 机器人当内容作者。

## 4. 文档与开发贡献

全站 UI 使用 React／TypeScript／TSX，包括资源正文展示组件；只有资源输入是 Markdown，自定义指令不变。页面在 src/routes，组件在 src/components，HTML 外壳在 src/root.tsx，不新增 Astro／MDX 层。页面交互以 MAIN 与 DESIGN 为准，组件 API 以内容规范为准。实现前查阅 [PLAN.md](PLAN.md) 当前阶段，避免把归档功能重新搬回。

贡献者可以开发或优化普通 Markdown 排版和资源组件。正文排版位于 `src/styles/prose.css`，控件与代码框样式位于 `src/styles/resource-components.css`，颜色与间距复用 `src/styles/tokens.css`；React 组件位于 `src/components/resource/`。资源作者不在文章中直接写字体、CSS 或 JSX，也不因视觉调整改指令参数。新增指令须同步 `src/content/schema/directives.ts`、解析与引用校验、`DocumentNodes.tsx` 渲染、内容规范、站内组件参考和必要迁移说明。新增字体或第三方静态文件时，保留上游版权和分发许可；现有 Fontsource 许可位于 `public/font-licenses/`，与项目自身许可证区分。

先使用已有成熟解析库，不自己写 Markdown 语法解析或版本比较器。业务代码改动先解释原因与边界；保持小范围实现和必要验证。禁止 UI 单元测试和浏览器自动验收；影响 UI 时列出手工验收清单，由维护者启动浏览器。

格式或架构变化要同步权威文档；不把临时研究记录当成已完成实现。源码、文档和第三方文件的许可证不能相互冒用。维护者已选定新站代码 MIT、原创文档 CC BY 4.0（原创程序示例仍为 MIT），贡献者保留版权并按对应许可贡献，无需 CLA。具体范围与第三方例外见[许可说明](docs/licensing.md)；上游资源的 license 标签不自动授权本仓库内容。
