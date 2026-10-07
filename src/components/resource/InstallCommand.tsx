import type { PublishedResource } from '../../content/registry/types.ts';
import { resolveSource } from '../../content/resolve/sources.ts';
import SourceEntry from './SourceEntry';
export default function InstallCommand({ resource, source }: { resource: PublishedResource; source: string }) {
  const entry = resolveSource(resource, source);
  if (entry.kind !== 'command') throw new Error(`InstallCommand 的 ${source} 不是包管理来源`);
  return <SourceEntry entry={entry} />;
}
