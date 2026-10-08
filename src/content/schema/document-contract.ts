/** 与 SiteLayout 的静态外壳保持一致；组件生成的控件 ID 在 P3 使用独立命名空间。 */
export const reservedDocumentAnchors = ['main-content'] as const;
export const sitePagePaths = ['/', '/resources/', '/about/', '/404.html'] as const;

/**
 * 行内文档链接标记：`<>[文字](地址)`。
 *
 * 为什么是标记而不是新指令：作者要的是"把这个跨文档链接显示成小按钮"，链接本身
 * 仍是标准 Markdown 链接，所以地址来源、站内资源存在性、锚点、草稿拦截和引用收集
 * 全部沿用既有 link 链路；标记只多加一个展示标志，不另造一套引用与校验规则。
 * 标记必须紧贴链接，且只能加在链接前面（有闭合标记的写法会让收尾符号掉进行首，被
 * Markdown 当成引用块）。只想显示这两个符号时用行内代码包起来。
 */
export const inlineLinkMarker = '<>';
