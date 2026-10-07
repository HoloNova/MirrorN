import type { PublishedResource } from '../../content/registry/types.ts';
import type { ResourceReference } from './ResourceCard';
import DocumentNodes from './DocumentNodes';
export default function ResourceDocument({ resource, references }: { resource: PublishedResource; references: readonly ResourceReference[] }) {
  return <DocumentNodes nodes={resource.document.children} resource={resource} references={references} />;
}
