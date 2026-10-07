import type { PublishedResource } from '../../content/registry/types.ts';
import { resolveDownload } from '../../content/resolve/sources.ts';
import SourceEntry from './SourceEntry';
export default function Download({ resource, source, label }: { resource: PublishedResource; source: string; label?: string }) {
  return <SourceEntry entry={resolveDownload(resource, source)} label={label} />;
}
