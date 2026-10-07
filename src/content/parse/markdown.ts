import GithubSlugger from 'github-slugger';
import type { Definition, Nodes, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { normalizeIdentifier } from 'micromark-util-normalize-identifier';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { ContentError, fail, issuesFrom, type LocatedData } from '../diagnostics.ts';
import { contentLimits } from '../limits.ts';
import { reservedDocumentAnchors } from '../schema/document-contract.ts';
import { parseDirective, rejectMalformedDirective } from './directive-syntax.ts';
import { documentNodes, type DocumentNode, type ResourceDirective, type ResourceDocument } from './document-types.ts';
import type { SourceText } from './source-text.ts';
import { parseYaml } from './yaml.ts';

const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm).use(remarkDirective).freeze();

interface ParseContext {
  readonly source: SourceText;
  readonly definitions: ReadonlyMap<string, Definition>;
  readonly slugger: GithubSlugger;
  readonly insideNotice: boolean;
}

function checkTree(node: Nodes, source: SourceText, depth = 0): number {
  const position = source.at(node.position?.start.offset ?? 0, 'document');
  if (depth > contentLimits.markdownDepth) fail(position, 'E_BUDGET', 'Markdown 嵌套超过 32 层');
  return 'children' in node ? node.children.reduce((count, child) => {
    const total = count + checkTree(child, source, depth + 1);
    if (total > contentLimits.markdownNodes) fail(position, 'E_BUDGET', 'Markdown 节点超过 50000 个');
    return total;
  }, 1) : 1;
}

function rawNodes(nodes: readonly Nodes[]): readonly Nodes[] {
  return nodes.flatMap((node) => [node, ...('children' in node ? rawNodes(node.children) : [])]);
}

function definitionMap(root: Root, source: SourceText): ReadonlyMap<string, Definition> {
  const definitions = rawNodes(root.children).filter((node): node is Definition => node.type === 'definition');
  const keys = definitions.map((node) => normalizeIdentifier(node.identifier));
  const first = new Map(keys.map((key, index) => [key, index] as const).toReversed());
  const duplicates = definitions.flatMap((node, index) => first.get(keys[index] ?? '') === index ? [] : [{
    ...source.at(node.position?.start.offset ?? 0, 'document.definition'), code: 'E_DUPLICATE', message: `重复 Markdown 链接定义 ${node.identifier}`,
  }]);
  if (duplicates.length) throw new ContentError(duplicates);
  return new Map(definitions.map((node) => [normalizeIdentifier(node.identifier), node]));
}

function childrenOf(node: Nodes, context: ParseContext): readonly DocumentNode[] {
  return 'children' in node ? node.children.flatMap((child) => {
    const converted = convertNode(child, context);
    return converted ? [converted] : [];
  }) : [];
}

function convertHeading(node: Extract<Nodes, { type: 'heading' }>, context: ParseContext): DocumentNode {
  const position = context.source.at(node.position?.start.offset ?? 0, 'document.heading');
  if (node.depth === 1) fail(position, 'E_MARKDOWN', '页面 h1 来自 name；正文从 h2 开始');
  const text = toString(node).trim();
  const id = context.slugger.slug(text);
  if (!id) fail(position, 'E_MARKDOWN', '标题必须能生成非空锚点，请包含文字或数字');
  return { type: 'heading', id, depth: node.depth, text, children: childrenOf(node, context), position };
}

function convertReference(node: Extract<Nodes, { type: 'linkReference' | 'imageReference' }>, context: ParseContext): DocumentNode {
  const position = context.source.at(node.position?.start.offset ?? 0, 'document.reference');
  const definition = context.definitions.get(normalizeIdentifier(node.identifier));
  if (!definition) fail(position, 'E_REFERENCE', `链接定义不存在：${node.identifier}`);
  if (node.type === 'imageReference') return { type: 'image', url: definition.url, alt: node.alt ?? '', title: definition.title ?? null, position };
  return { type: 'link', url: definition.url, title: definition.title ?? null, children: childrenOf(node, context), position };
}

function convertText(node: Extract<Nodes, { type: 'text' }>, context: ParseContext): DocumentNode {
  const offset = node.position?.start.offset ?? 0;
  const raw = context.source.text.slice(offset, node.position?.end.offset);
  const tag = raw.match(/(?<!\\)(?:\\\\)*<\/?[A-Za-z][A-Za-z0-9_-]*(?=[\s/{>])/u);
  if (tag) fail(context.source.at(offset + (tag.index ?? 0) + tag[0].lastIndexOf('<'), 'document'), 'E_MARKDOWN', '不接受原始 HTML / JSX 标签或展开属性；示例请转义或放代码块');
  return { type: 'text', value: node.value, position: context.source.at(offset, 'document') };
}

function convertNode(node: Nodes, context: ParseContext): DocumentNode | undefined {
  const position = context.source.at(node.position?.start.offset ?? 0, 'document');
  switch (node.type) {
    case 'definition': return undefined;
    case 'text': return convertText(node, context);
    case 'inlineCode': return { type: 'inlineCode', value: node.value, position };
    case 'code': return { type: 'code', value: node.value, language: node.lang ?? null, meta: node.meta ?? null, position };
    case 'break': case 'thematicBreak': return { type: node.type, position };
    case 'heading': return convertHeading(node, context);
    case 'paragraph':
      rejectMalformedDirective(node, context.source);
      return { type: 'paragraph', children: childrenOf(node, context), position };
    case 'strong': case 'emphasis': case 'delete': case 'blockquote': case 'tableRow': case 'tableCell':
      return { type: node.type, children: childrenOf(node, context), position };
    case 'list': return { type: 'list', ordered: node.ordered ?? false, start: node.start ?? null, spread: node.spread ?? false, children: childrenOf(node, context), position };
    case 'listItem': return { type: 'listItem', checked: node.checked ?? null, spread: node.spread ?? false, children: childrenOf(node, context), position };
    case 'table': return { type: 'table', align: node.align ?? [], children: childrenOf(node, context), position };
    case 'link': return { type: 'link', url: node.url, title: node.title ?? null, children: childrenOf(node, context), position };
    case 'image': return { type: 'image', url: node.url, alt: node.alt ?? '', title: node.title ?? null, position };
    case 'linkReference': case 'imageReference': return convertReference(node, context);
    case 'containerDirective': case 'leafDirective': case 'textDirective': {
      const directive = parseDirective(node, context.source, context.insideNotice);
      const childContext = { ...context, insideNotice: true };
      return { ...directive, children: childrenOf(node, childContext) } as ResourceDirective;
    }
    case 'html': return fail(position, 'E_MARKDOWN', 'v1 不接受原始 HTML / JSX；示例请放代码块');
    default: fail(position, 'E_MARKDOWN', `v1 未注册节点类型 ${node.type}`);
  }
}

export interface ParsedMarkdown {
  readonly frontMatter: LocatedData;
  readonly document: ResourceDocument;
}

export function parseMarkdown(source: SourceText): ParsedMarkdown {
  try {
    const root = parser.parse(source.text);
    checkTree(root, source);
    const first = root.children[0];
    if (first?.type !== 'yaml') fail(source.at(0, 'frontMatter'), 'E_FRONT_MATTER', 'index.md 必须以 --- YAML Front Matter --- 开始');
    const start = source.text.indexOf('\n', first.position?.start.offset ?? 0) + 1;
    const end = source.text.lastIndexOf('\n', (first.position?.end.offset ?? 0) - 1) + 1;
    const frontMatter = parseYaml(source, source.text.slice(start, end), start);
    const definitions = definitionMap(root, source);
    const slugger = new GithubSlugger();
    for (const anchor of reservedDocumentAnchors) slugger.slug(anchor);
    const context: ParseContext = { source, definitions, slugger, insideNotice: false };
    const children = root.children.slice(1).flatMap((node) => {
      const converted = convertNode(node, context);
      return converted ? [converted] : [];
    });
    const headings = documentNodes(children).flatMap((node) => node.type === 'heading'
      ? [{ id: node.id, depth: node.depth, text: node.text, position: node.position }] : []);
    return {
      frontMatter,
      document: {
        children, headings,
        definitions: [...definitions.values()].map((node) => ({
          identifier: node.identifier, url: node.url,
          position: source.at(node.position?.start.offset ?? 0, 'document.definition'),
        })),
      },
    };
  } catch (error) {
    if (error instanceof ContentError) throw error;
    throw new ContentError(issuesFrom(error, source.at(0, 'document')));
  }
}
