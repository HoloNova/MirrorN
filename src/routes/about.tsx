import { useRouteLoaderData } from 'react-router';
import type { loader } from '../root';
import { siteConfig } from '../../config/site.ts';
export default function About() {
  const data = useRouteLoaderData<typeof loader>('root');
  return <article className="reading-page prose about">
    <h1>关于本站</h1><p className="page-lede">MirrorN 整理开发常用资源与学习文档，提供下载直链、镜像入口和安装说明。资源与文档由贡献者通过 Git 共同维护。</p>
    <div className="page-actions">{siteConfig.repositoryUrl && <a className="page-action" href={siteConfig.repositoryUrl}>项目仓库</a>}{data?.contributionId && <a className="page-action" href={`/resources/${data.contributionId}/`}>贡献指南</a>}<a className="page-action" href="/resources/">已收录 {data?.search.count ?? 0} 项</a></div>
    {!siteConfig.repositoryUrl && <p>贡献仓库地址尚未配置，正式发布前会在站点配置中填写真实地址，不使用占位链接。</p>}
    <h2>如何获取资源</h2><p>资源页先展示获取入口，再说明安装与使用。官方下载、镜像下载、本站文件和下载页面会分别标明；安装命令可复制，但不会由本站执行。并非每项资源都有镜像或本站文件，以页面实际提供的入口为准。</p>
    <h2>参与贡献</h2><p>欢迎补充资源、修订文档、维护下载来源，也可以开发或优化 Markdown 展示组件。已有样式和使用方法见<a href="/resources/mirrorn-components/">Markdown 样式与组件参考</a>。</p>
    <h2>许可</h2>
    <div className="resource-table-scroll" role="region" aria-label="许可一览" tabIndex={0}><table><thead><tr><th scope="col">范围</th><th scope="col">许可</th></tr></thead><tbody>
      <tr><td>本站代码、文档中的原创代码示例</td><td><a href="/licenses/mit.txt">MIT</a></td></tr>
      <tr><td>原创文档（除另有标注）</td><td><a href="/licenses/cc-by-4.0.txt">CC BY 4.0</a>：可转载和改编，须保留作者、原文链接并说明改动</td></tr>
      <tr><td>界面与检索依赖</td><td><a href="/licenses/react.txt">React</a>、<a href="/licenses/react-dom.txt">React DOM</a>、<a href="/licenses/react-router.txt">React Router</a>、<a href="/licenses/zod.txt">Zod</a>（MIT）；<a href="/licenses/fuse.txt">Fuse.js</a>（Apache-2.0）</td></tr>
      <tr><td>字体（Inter、JetBrains Mono，中文使用系统字体）</td><td>SIL OFL 1.1：<a href="/font-licenses/inter.txt">Inter</a>、<a href="/font-licenses/jetbrains-mono.txt">JetBrains Mono</a></td></tr>
    </tbody></table></div>
    <p>外部软件、图片、模型、数据集与第三方附件仍按各自许可；站内收录不等于重新授权，Git 历史中的旧代码保留原有许可。</p>
  </article>;
}
