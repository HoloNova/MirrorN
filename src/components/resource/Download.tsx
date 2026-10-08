import type { DirectiveProps } from '../../content/schema/directives.ts';
import type { PublishedResource } from '../../content/registry/types.ts';
import { resolveDownload } from '../../content/resolve/sources.ts';
import HealthBadge from './HealthBadge';
import SourceEntry from './SourceEntry';
import { externalLinkProps } from '../external-link.ts';
export default function Download({ resource, props }: { resource: PublishedResource; props: DirectiveProps<'download'> }) {
  if (props.source !== undefined) return <SourceEntry entry={resolveDownload(resource, props.source)} label={props.label} />;
  // Schema 已保证 source 与 url 二选一，且 url 写法必有 label。
  if (props.url === undefined || props.label === undefined) throw new Error('Download 缺少 source 或 url');
  // 不写 status 时不显示徽章；行内写法与 sources.json 的 health 保持同一条规则。
  const health = props.status;
  const page = props.target === 'page';
  return <div className="source-entry">
    <div className="source-entry__heading"><strong>{props.label}</strong><span className="resource-muted">{page ? '网页入口' : '直链'}</span><HealthBadge health={health} checkedAt={props.checked} /></div>
    {props.note && <p className="source-entry__note">{props.note}</p>}
    {health === 'broken' ? <><p className="resource-state resource-state--danger">此链接已标记失效，暂不提供操作入口。</p><span className="resource-action resource-action--disabled" aria-disabled="true">{page ? '访问页面' : '下载文件'}</span></>
      : <a className="resource-action" href={props.url} {...externalLinkProps(props.url)}>{page ? '访问页面' : '下载文件'}</a>}
  </div>;
}
