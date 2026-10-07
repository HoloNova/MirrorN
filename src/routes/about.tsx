import { useRouteLoaderData } from 'react-router';
import type { loader } from '../root';
import { siteConfig } from '../../config/site.ts';
export default function About() {
  const data = useRouteLoaderData<typeof loader>('root');
  return <article className="reading-page prose about">
    <h1>关于本站</h1><p className="page-lede">本站以人工收录资源、整理使用文档为目标。如果您愿意贡献自己整理的资源或改进现有文档，欢迎前往项目仓库提交 PR。感谢每一位贡献者的支持。</p>
    <div className="page-actions">{siteConfig.repositoryUrl && <a className="page-action" href={siteConfig.repositoryUrl}>项目仓库</a>}{data?.contributionId && <a className="page-action" href={`/resources/${data.contributionId}/`}>贡献指南</a>}<a className="page-action" href="/resources/">已收录 {data?.search.count ?? 0} 项</a></div>
    {!siteConfig.repositoryUrl && <p>贡献仓库地址尚未配置，正式发布前会在站点配置中填写真实地址，不使用占位链接。</p>}
    <h2>本站不做什么</h2><ul><li>不托管全部资源：页面只指向维护者核实过的来源，不承诺第三方下载地址长期可用。</li><li>不代理第三方文件，不自动抓取发布清单，不测速，也不自动选择所谓最快来源。</li><li>没有账号系统、管理后台和数据库；资源文档与来源数据只通过 Git 提交和审核维护。</li></ul>
    <h2>许可</h2>
    <div className="resource-table-scroll" role="region" aria-label="许可一览" tabIndex={0}><table><thead><tr><th scope="col">范围</th><th scope="col">许可</th></tr></thead><tbody>
      <tr><td>本站代码、文档中的原创代码示例</td><td><a href="/licenses/mit.txt">MIT</a></td></tr>
      <tr><td>原创文档（除另有标注）</td><td><a href="/licenses/cc-by-4.0.txt">CC BY 4.0</a>：可转载和改编，须保留作者、原文链接并说明改动</td></tr>
      <tr><td>界面与检索依赖</td><td><a href="/licenses/react.txt">React</a>、<a href="/licenses/react-dom.txt">React DOM</a>、<a href="/licenses/react-router.txt">React Router</a>、<a href="/licenses/zod.txt">Zod</a>（MIT）；<a href="/licenses/fuse.txt">Fuse.js</a>（Apache-2.0）</td></tr>
      <tr><td>字体（Inter、JetBrains Mono，中文使用系统字体）</td><td>SIL OFL 1.1：<a href="/font-licenses/inter.txt">Inter</a>、<a href="/font-licenses/jetbrains-mono.txt">JetBrains Mono</a></td></tr>
    </tbody></table></div>
    <p>外部软件、图片、模型、数据集与第三方附件仍按各自许可；站内收录不等于重新授权，归档代码保留原有许可。</p>
  </article>;
}
