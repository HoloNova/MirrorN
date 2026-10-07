import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadResourceData } from '../content/site.server.ts';
import ResourceLayout from '../layouts/ResourceLayout';
import ResourceMetadata from '../components/resource/ResourceMetadata';
import ResourceDocument from '../components/resource/ResourceDocument';
import Notice from '../components/resource/Notice';
export async function loader({ params }: LoaderFunctionArgs) { return loadResourceData(params.id ?? ''); }
export default function Resource() {
  const data = useLoaderData<typeof loader>();
  const { resource, categoryName, editUrl, contributionId, returnHref, references, highlights } = data;
  const metadata = resource.metadata;
  const footer = <footer className="resource-footer"><nav aria-label="文章操作"><a className="page-action" href={returnHref}>返回{categoryName}</a>{editUrl && <a className="page-action" href={editUrl} rel="noopener">编辑此页（GitHub）</a>}{contributionId && contributionId !== metadata.id && <a className="page-action" href={`/resources/${contributionId}/`}>贡献指南</a>}</nav>
    {editUrl && <p>在 GitHub 完成修改后主动提交 PR；同一项修改继续更新同一个 PR。本站不会自动提 PR。</p>}
    <p>除另有标注，本站原创文档采用 <a href="/licenses/cc-by-4.0.txt">CC BY 4.0</a>，转载请保留作者与原文链接、注明改动；原创程序示例采用 MIT，所介绍资源与附件按各自许可。</p>
  </footer>;
  return <ResourceLayout title={metadata.name} summary={metadata.summary} headings={resource.document.headings} metadata={<ResourceMetadata resource={resource} categoryName={categoryName} />} footer={footer}>
    {metadata.status !== 'active' && <Notice type="warning" title={metadata.status === 'deprecated' ? '资源已废弃' : '资源仅作存档'}><p>{metadata.statusReason}</p></Notice>}
    <ResourceDocument resource={resource} references={references} highlights={highlights} />
  </ResourceLayout>;
}
