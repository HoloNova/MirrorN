import type { PublishedResource } from '../../content/registry/types.ts';
import type { HighlightedCode } from '../../content/schema/code-blocks.ts';
import type { ResourceReference } from './ResourceCard';
import DocumentNodes from './DocumentNodes';
import { HighlightContext } from './HighlightContext';
export default function ResourceDocument({ resource, references, highlights }: { resource: PublishedResource; references: readonly ResourceReference[]; highlights: Readonly<Record<string, HighlightedCode>> }) {
  return <HighlightContext value={highlights}><DocumentNodes nodes={resource.document.children} resource={resource} references={references} /></HighlightContext>;
}
