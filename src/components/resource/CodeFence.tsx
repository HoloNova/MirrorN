import { useContext } from 'react';
import type { DocumentNode } from '../../content/parse/document-types.ts';
import { codeKey, codeLanguages } from '../../content/schema/code-blocks.ts';
import CopyBlock from './CopyBlock';
import { HighlightContext } from './HighlightContext';
export default function CodeFence({ node }: { node: Extract<DocumentNode, { type: 'code' }> }) {
  const highlights = useContext(HighlightContext);
  return <CopyBlock mac value={node.value} label={codeLanguages[node.language].label} title={node.title ?? undefined} tokens={highlights[codeKey(node.position)]} />;
}
