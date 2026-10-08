import type { ResolvedSource } from '../../content/resolve/sources.ts';
import { artifactDescription, formatByteLength } from '../../content/resolve/selection.ts';
import CopyBlock from './CopyBlock';
import HealthBadge from './HealthBadge';
import { externalLinkProps } from '../external-link.ts';
const origins = { direct: '直链', release: '发布来源', repository: '源码仓库', 'package-manager': '包管理器', webpage: '网页入口', mirror: '镜像来源', local: '本站附件', 'external-storage': '外部存储' };
export default function SourceEntry({ entry, label }: { entry: ResolvedSource; label?: string }) {
  const broken = entry.health === 'broken';
  return <div className="source-entry" data-source-id={entry.id}>
    <div className="source-entry__heading"><strong>{entry.label}</strong><span className="resource-muted">{origins[entry.type]}</span><HealthBadge health={entry.health} checkedAt={entry.checkedAt} /></div>
    {entry.kind === 'file' && <p className="resource-muted">{artifactDescription(entry)} / {formatByteLength(entry.byteLength)}</p>}
    {entry.note && <p className="source-entry__note">{entry.note}</p>}
    {broken && <p className="resource-state resource-state--danger">此来源已标记失效，暂不提供操作入口。</p>}
    {entry.kind === 'command' ? <><CopyBlock mac value={entry.command} label={`${entry.packageManager} / ${entry.shell}`} disabled={broken} />{!broken && entry.href && <a className="resource-link" href={entry.href} {...externalLinkProps(entry.href)}>访问包页面</a>}</> : broken ? <span className="resource-action resource-action--disabled" aria-disabled="true">{label ?? entry.action}</span> : <a className="resource-action" href={entry.href} {...externalLinkProps(entry.href)} download={entry.kind === 'file' ? entry.downloadName : undefined}>{label ?? entry.action}</a>}
  </div>;
}
