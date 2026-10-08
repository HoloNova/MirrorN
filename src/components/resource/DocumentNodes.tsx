import { Fragment, type ReactNode } from 'react';
import type { DocumentNode } from '../../content/parse/document-types.ts';
import type { PublishedResource } from '../../content/registry/types.ts';
import { resolveDocumentUrl } from '../../content/resolve/assets.ts';
import { externalLinkProps } from '../external-link.ts';
import CodeFence from './CodeFence';
import Choice from './Choice';
import Download from './Download';
import DownloadSelect from './DownloadSelect';
import SourceList from './SourceList';
import InstallCommand from './InstallCommand';
import Notice from './Notice';
import Checksum from './Checksum';
import CompatibilityTable from './CompatibilityTable';
import ResourceCard, { type ResourceReference } from './ResourceCard';
interface Props {
  nodes: readonly DocumentNode[]; resource: PublishedResource; references: readonly ResourceReference[];
  unwrapParagraphs?: boolean; looseList?: boolean; headerCells?: boolean;
  alignments?: readonly ('left' | 'right' | 'center' | null)[];
  alignment?: 'left' | 'right' | 'center' | null;
}

/** 受限 AST 的唯一展示入口；不编译 Markdown 内的 JSX、不注入原始 HTML。 */
export default function DocumentNodes(props: Props) {
  return props.nodes.map((node, index) => <Fragment key={`${node.position.line}:${node.position.column}:${index}`}>{renderNode(node, props)}</Fragment>);
}
function renderNode(node: DocumentNode, props: Props): ReactNode {
  const { resource, references, unwrapParagraphs = false, looseList = false, headerCells = false, alignments = [], alignment } = props;
  const children = 'children' in node ? <DocumentNodes nodes={node.children} resource={resource} references={references} /> : null;
  switch (node.type) {
    case 'text': return node.value;
    case 'inlineCode': return <code>{node.value}</code>;
    case 'code': return <CodeFence node={node} />;
    case 'break': return <br />;
    case 'thematicBreak': return <hr />;
    case 'paragraph': return unwrapParagraphs ? children : <p>{children}</p>;
    case 'heading': { const Heading = `h${node.depth}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6'; return <Heading id={node.id}>{children}</Heading>; }
    case 'strong': return <strong>{children}</strong>;
    case 'emphasis': return <em>{children}</em>;
    case 'delete': return <del>{children}</del>;
    case 'blockquote': return <blockquote>{children}</blockquote>;
    case 'list': { const List = node.ordered ? 'ol' : 'ul'; return <List start={node.ordered ? node.start ?? undefined : undefined}><DocumentNodes nodes={node.children} resource={resource} references={references} looseList={node.spread} /></List>; }
    case 'listItem': return <li>{node.checked !== null && <input type="checkbox" disabled readOnly checked={node.checked} aria-label={node.checked ? '已完成' : '未完成'} />}<DocumentNodes nodes={node.children} resource={resource} references={references} unwrapParagraphs={!looseList && !node.spread} /></li>;
    case 'table': return <div className="resource-table-scroll" role="region" aria-label="文档表格" tabIndex={0}><table><thead><DocumentNodes nodes={node.children.slice(0, 1)} resource={resource} references={references} headerCells alignments={node.align} /></thead><tbody><DocumentNodes nodes={node.children.slice(1)} resource={resource} references={references} alignments={node.align} /></tbody></table></div>;
    case 'tableRow': return <tr>{node.children.map((cell, index) => <DocumentNodes key={index} nodes={[cell]} resource={resource} references={references} headerCells={headerCells} alignment={alignments[index]} />)}</tr>;
    case 'tableCell': { const Cell = headerCells ? 'th' : 'td'; return <Cell scope={headerCells ? 'col' : undefined} style={{ textAlign: alignment ?? 'start' }}>{children}</Cell>; }
    case 'footnoteReference': return <sup className="footnote-ref"><a id={node.occurrence === 1 ? `footnote-ref-${node.number}` : `footnote-ref-${node.number}-${node.occurrence}`} href={`#footnote-${node.number}`} aria-label={`脚注 ${node.number}`}>{node.number}</a></sup>;
    case 'footnotes': return <section className="footnotes" aria-label="脚注"><hr /><ol>{children}</ol></section>;
    case 'footnoteItem': return <li id={`footnote-${node.number}`}><DocumentNodes nodes={node.children} resource={resource} references={references} unwrapParagraphs={node.children.length === 1} /> <a className="footnote-back" href={`#footnote-ref-${node.number}`} aria-label={`返回正文中的脚注 ${node.number}`}>↩</a></li>;
    case 'link': { const href = resolveDocumentUrl(resource, node.url); return <a className={node.chip ? 'resource-chip' : undefined} href={href} title={node.title ?? undefined} {...externalLinkProps(href)}>{children}</a>; }
    case 'image': return <img src={resolveDocumentUrl(resource, node.url)} alt={node.alt} title={node.title ?? undefined} loading="lazy" decoding="async" />;
    case 'resourceDirective':
      switch (node.name) {
        case 'download': return <Download resource={resource} props={node.props} />;
        case 'download-select': return <DownloadSelect resource={resource} group={node.props.group} />;
        case 'source-list': return <SourceList resource={resource} group={node.props.group} />;
        case 'install-command': return <InstallCommand resource={resource} source={node.props.source} />;
        case 'notice': return <Notice type={node.props.type} title={node.props.title}>{children}</Notice>;
        case 'choice': return <Choice label={node.props.label} options={node.children.flatMap((child) => child.type === 'resourceDirective' && child.name === 'option' ? [{ label: child.props.label, content: <DocumentNodes nodes={child.children} resource={resource} references={references} /> }] : [])} />;
        case 'option': return children;
        case 'details': return <details className="resource-details"><summary>{node.props.title}</summary>{children}</details>;
        case 'steps': return <div className="resource-steps">{children}</div>;
        case 'checksum': return <Checksum resource={resource} artifact={node.props.artifact} />;
        case 'compatibility-table': return <CompatibilityTable resource={resource} table={node.props.table} />;
        case 'resource-card': return <ResourceCard references={references} resource={node.props.resource} />;
      }
  }
}
