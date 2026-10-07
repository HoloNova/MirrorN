import type { PublishedResource } from '../../content/registry/types.ts';
import { resolveGroup } from '../../content/resolve/sources.ts';
import SourceEntry from './SourceEntry';
export default function SourceList({ resource, group: id }: { resource: PublishedResource; group: string }) {
  const { group, entries } = resolveGroup(resource, id);
  return <section className="resource-component" aria-label={group.label}>
    <p className="resource-component__title">{group.label}</p>
    {entries.every((entry) => entry.health === 'broken') && <p className="resource-state resource-state--danger">当前没有可用入口，以下保留各来源说明。</p>}
    <ul className="source-list">{entries.map((entry) => <li key={entry.id}><SourceEntry entry={entry} /></li>)}</ul>
  </section>;
}
