# 资源贡献模板

运行 `pnpm resource:new <id>`，会从 [资源文档模板](resource/index.md) 与 [来源空结构](resource/sources.json) 创建 `content/resources/<id>/`。ID 必须符合内容契约；已有目录不会覆盖。模板长期维护、单独校验，不会被内容扫描器当成已收录资源。

初始内容保持 draft=true，没有伪造官网、下载链接或默认作者。按 [内容规范](../docs/content-spec.md) 编写正文与真实来源，填写公开必需的 summary、tags、authors、publishedAt、status；名称汉字开头时填写拼音 sortKey。删除模板写作说明后，再显式选择 draft=false。

`pnpm template:check` 直接检查模板，不创建临时样本。草稿可以运行 `pnpm content:check --include-drafts` 检查结构，但没有草稿页面预览 UI；正式页面只生成公开资源。完成后运行 `pnpm check`，由贡献者主动发起 PR。

不需要文件来源的纯文档可以保留空 sources.json。需要下载或命令的资源按现行 Schema 增加 artifacts、sources、groups；正文用来源／组 ID 引用，不改组件实现。
