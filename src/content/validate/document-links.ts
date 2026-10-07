import { extname } from 'node:path';
import { fail } from '../diagnostics.ts';
import { imageExtensions } from '../limits.ts';
import { documentNodes, type DocumentNode, type ResourceDocument } from '../parse/document-types.ts';
import type { ResourceInput } from '../registry/input.ts';
import { reservedDocumentAnchors } from '../schema/document-contract.ts';
import { documentTarget, type DocumentTarget } from './document-urls.ts';
import type { AssetRequest } from './file-types.ts';

interface LinkContext {
  readonly input: ResourceInput;
  readonly resources: ReadonlyMap<string, ResourceInput>;
  readonly siteUrl?: string | null;
}

function checkTarget(target: DocumentTarget, node: { readonly position: DocumentNode['position'] }, context: LinkContext): void {
  if (target.kind === 'resource') {
    const resource = context.resources.get(target.id);
    if (!resource) fail(node.position, 'E_REFERENCE', `站内资源不存在：${target.id}`);
    if (!context.input.metadata.draft && resource.metadata.draft) fail(node.position, 'E_REFERENCE', '公开资源不能链接到草稿');
    if (target.anchor && !resource.document.headings.some((heading) => heading.id === target.anchor)
      && !reservedDocumentAnchors.includes(target.anchor as (typeof reservedDocumentAnchors)[number])) {
      fail(node.position, 'E_ANCHOR', `资源 ${target.id} 没有锚点 ${target.anchor}`);
    }
  } else if (target.kind === 'site' && target.anchor
    && !reservedDocumentAnchors.includes(target.anchor as (typeof reservedDocumentAnchors)[number])) {
    fail(node.position, 'E_ANCHOR', `站点页面 ${target.path} 没有登记锚点 ${target.anchor}`);
  }
}

function checkLocalDownload(target: DocumentTarget, position: DocumentNode['position']): void {
  if (target.kind === 'asset' && !imageExtensions.includes(extname(target.path).toLowerCase() as (typeof imageExtensions)[number])) {
    fail(position, 'E_URL', '本地下载使用 local Source 与下载指令，正文不直接链接下载文件路径');
  }
}

function resolveNode(node: DocumentNode, context: LinkContext): DocumentNode {
  const children = 'children' in node ? node.children.map((child) => resolveNode(child, context)) : undefined;
  const copy = children ? { ...node, children } as DocumentNode : node;
  if (copy.type !== 'link' && copy.type !== 'image') return copy;
  const target = documentTarget(copy.url, context.input.metadata.id, copy.position, copy.type === 'link' ? context.siteUrl : undefined);
  if (copy.type === 'image' && (target.kind === 'site' || target.kind === 'resource')) fail(copy.position, 'E_URL', '图片使用 HTTP(S) 或当前资源 assets/ 内路径');
  if (copy.type === 'link') checkLocalDownload(target, copy.position);
  checkTarget(target, copy, context);
  return { ...copy, url: target.url };
}

export interface ValidatedDocument {
  readonly document: ResourceDocument;
  readonly assets: readonly AssetRequest[];
  readonly resourceReferences: readonly string[];
}

export function validateDocumentLinks(input: ResourceInput, resources: ReadonlyMap<string, ResourceInput>, siteUrl?: string | null): ValidatedDocument {
  const context: LinkContext = { input, resources, siteUrl };
  const children = input.document.children.map((node) => resolveNode(node, context));
  const definitions = input.document.definitions.map((definition) => {
    const target = documentTarget(definition.url, input.metadata.id, definition.position, siteUrl);
    checkLocalDownload(target, definition.position);
    checkTarget(target, definition, context);
    return { ...definition, url: target.url };
  });
  const nodes = documentNodes(children);
  const links = nodes.filter((node): node is Extract<DocumentNode, { type: 'link' | 'image' }> => node.type === 'link' || node.type === 'image');
  const assets = links.flatMap((node) => {
    const target = documentTarget(node.url, input.metadata.id, node.position, node.type === 'link' ? siteUrl : undefined);
    return target.kind === 'asset' ? [{ path: target.path, kind: node.type === 'image' ? 'image' as const : 'download' as const, location: node.position, referenced: true }] : [];
  });
  const definitionAssets = definitions.flatMap((definition) => {
    const target = documentTarget(definition.url, input.metadata.id, definition.position, siteUrl);
    return target.kind === 'asset' ? [{ path: target.path, kind: 'download' as const, location: definition.position, referenced: false }] : [];
  });
  const cardReferences = nodes.flatMap((node) => node.type === 'resourceDirective' && node.name === 'resource-card' ? [node.props.resource] : []);
  const linkReferences = [...links, ...definitions].flatMap((node) => {
    const target = documentTarget(node.url, input.metadata.id, node.position, 'type' in node && node.type === 'image' ? undefined : siteUrl);
    return target.kind === 'resource' && target.id !== input.metadata.id ? [target.id] : [];
  });
  return { document: { ...input.document, children, definitions }, assets: [...assets, ...definitionAssets], resourceReferences: [...new Set([...cardReferences, ...linkReferences])] };
}
