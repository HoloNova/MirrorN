import { useRouteLoaderData } from 'react-router';
import type { loader } from '../root';
import { siteConfig } from '../../config/site.ts';
export default function About() {
  const data = useRouteLoaderData<typeof loader>('root');
  return <article className="reading-page prose">
    <h1>关于本站</h1><p className="page-lede">本站以人工收录资源、整理使用文档为目标。如果您愿意贡献自己整理的资源或改进现有文档，欢迎前往项目仓库提交 PR。感谢每一位贡献者的支持。</p>
    <h2>贡献入口</h2>{siteConfig.repositoryUrl ? <p><a href={siteConfig.repositoryUrl}>项目仓库</a></p> : <p>贡献仓库地址尚未配置，因此这里暂时没有仓库链接。正式发布前会在站点配置中填写真实地址，不使用占位域名。</p>}
    {data?.contributionId && <p><a href={`/resources/${data.contributionId}/`}>阅读贡献指南</a></p>}
    <h2>本站不做什么</h2><ul><li>不托管全部资源：页面只指向维护者核实过的来源，不承诺第三方下载地址长期可用。</li><li>不代理第三方文件，不自动抓取发布清单，不测速，也不自动选择所谓最快来源。</li><li>没有账号系统、管理后台和数据库；资源文档与来源数据只通过 Git 提交和审核维护。</li></ul>
    <h2>当前状态</h2><p>当前公开收录 {data?.search.count ?? 0} 个资源。内容校验、资源组件、文档阅读与下载入口可用，可从<a href="/resources/">已收录目录</a>浏览，或在<a href="/">首页搜索</a>名称、别名与标签。</p>
    <h2>代码与原创文档许可</h2><p>MirrorN 新站代码采用 <a href="/licenses/mit.txt">MIT</a>；除另有标注，原创文档采用 <a href="/licenses/cc-by-4.0.txt">CC BY 4.0</a>，允许转载和改编，须保留作者与原文链接并说明改动。文档中的原创代码示例采用 MIT。</p>
    <p>外部软件、图片、模型、数据集与第三方附件仍按各自许可；站内收录不等于重新授权。归档代码保留原有许可。本页与资源页不承诺所介绍资源适用本站许可证。</p>
    <p>浏览器界面采用 <a href="/licenses/react.txt">React（MIT）</a>、<a href="/licenses/react-dom.txt">React DOM（MIT）</a>与<a href="/licenses/react-router.txt">React Router（MIT）</a>；检索复用 <a href="/licenses/fuse.txt">Fuse.js（Apache-2.0）</a>与<a href="/licenses/zod.txt">Zod（MIT）</a>，完整原始许可随本站分发。</p>
    <h2>字体与许可</h2><p>页面中的 Latin 字符使用自托管的 Inter，代码使用 JetBrains Mono；中文使用系统字体。字体未加载时仍可阅读。两款字体采用 SIL Open Font License 1.1：<a href="/font-licenses/inter.txt">Inter 原始许可</a>、<a href="/font-licenses/jetbrains-mono.txt">JetBrains Mono 原始许可</a>。字体许可不替代本站代码、文档或外部资源各自的许可。</p>
  </article>;
}
