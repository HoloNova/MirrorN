import type { PublishedResource } from '../../content/registry/types.ts';
import { categoryHref } from '../../content/navigation.ts';
const statusLabels = { active: '正常维护', deprecated: '已废弃', archived: '仅存档' };
export default function ResourceMetadata({ resource, categoryName }: { resource: PublishedResource; categoryName: string }) {
  const metadata = resource.metadata;
  return <dl className="resource-metadata" aria-label="资源信息">
    <div><dt>类别</dt><dd><a href={categoryHref(metadata.category)}>{categoryName}</a></dd></div>
    <div><dt>维护状态</dt><dd>{statusLabels[metadata.status]}</dd></div>
    <div><dt>作者／贡献者</dt><dd>{metadata.authors.join('、')}</dd></div>
    <div><dt>发布</dt><dd><time dateTime={metadata.publishedAt}>{metadata.publishedAt}</time></dd></div>
    {metadata.updatedAt && <div><dt>更新</dt><dd><time dateTime={metadata.updatedAt}>{metadata.updatedAt}</time></dd></div>}
  </dl>;
}
