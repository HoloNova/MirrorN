import GithubSlugger from 'github-slugger';
import type { Definition, Nodes, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { normalizeIdentifier } from 'micromark-util-normalize-identifier';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { ContentError, fail, issuesFrom, type ContentLocation, type LocatedData } from '../diagnostics.ts';
import { contentLimits } from '../limits.ts';
import { parseCodeFence } from '../schema/code-blocks.ts';
import { reservedDocumentAnchors } from '../schema/document-contract.ts';
import { checkContainerShape, parseDirective, rejectMalformedDirective, type ContainerContext } from './directive-syntax.ts';
import { documentNodes, type DocumentNode, type ResourceDirective, type ResourceDocument } from './document-types.ts';
import type { SourceText } from './source-text.ts';
import { parseYaml } from './yaml.ts';

const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm).use(remarkDirective).freeze();

interface ParseContext {
  readonly source: SourceText;
  readonly definitions: ReadonlyMap<string, Definition>;
  readonly slugger: GithubSlugger;
  /** 当前正文所在容器；null 表示文档根。 */
  readonly container: ContainerContext | null;
  readonly footnotes: FootnoteState;
}

/** 解析期收集，不可变节点只在最后一步生成。 */
interface FootnoteState {
  readonly order: string[];
  readonly occurrences: Map<string, number>;
  readonly definitions: Map<string, { readonly position: ContentLocation; readonly children: readonly DocumentNode[] }>;
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
  // 选项、折叠块和脚注里的内容可能被隐藏，标题放进去会让右侧目录指向看不见的章节。
  if (context.container === 'option' || context.container === 'details' || context.container === 'footnote') fail(position, 'E_MARKDOWN', '选项、折叠块和脚注内不使用标题；把标题放在它们外面');
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
  const footnote = raw.match(/(?<!\\)(?:\\\\)*\[\^([^\]\s]+)\]/u);
  if (footnote) fail(context.source.at(offset + (footnote.index ?? 0), 'document'), 'E_REFERENCE', `脚注 [^${footnote[1]}] 没有对应的定义；定义写成独立一行 [^${footnote[1]}]: 说明文字`);
  return { type: 'text', value: node.value, position: context.source.at(offset, 'document') };
}

function convertNode(node: Nodes, context: ParseContext): DocumentNode | undefined {
  const position = context.source.at(node.position?.start.offset ?? 0, 'document');
  switch (node.type) {
    case 'definition': return undefined;
    case 'text': return convertText(node, context);
    case 'inlineCode': return { type: 'inlineCode', value: node.value, position };
    case 'code': {
      const fence = parseCodeFence(node.lang ?? null, node.meta ?? null);
      if ('error' in fence) fail(position, 'E_MARKDOWN', fence.error);
      return { type: 'code', value: node.value, language: fence.language, title: fence.title, position };
    }
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
    case 'footnoteReference': {
      if (context.container === 'footnote') fail(position, 'E_MARKDOWN', '脚注内不嵌套脚注引用');
      const { order, occurrences } = context.footnotes;
      const key = normalizeIdentifier(node.identifier);
      if (!order.includes(key)) order.push(key);
      const occurrence = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, occurrence);
      return { type: 'footnoteReference', number: order.indexOf(key) + 1, occurrence, position };
    }
    case 'footnoteDefinition': {
      const key = normalizeIdentifier(node.identifier);
      if (context.footnotes.definitions.has(key)) fail(position, 'E_DUPLICATE', `重复脚注定义 ${node.identifier}`);
      context.footnotes.definitions.set(key, { position, children: childrenOf(node, { ...context, container: 'footnote' }) });
      return undefined;
    }
    case 'containerDirective': case 'leafDirective': case 'textDirective': {
      const directive = parseDirective(node, context.source, context.container);
      const container = directive.name === 'notice' || directive.name === 'choice' || directive.name === 'option' || directive.name === 'details' || directive.name === 'steps' ? directive.name : context.container;
      const children = childrenOf(node, { ...context, container });
      checkContainerShape(directive, children);
      return { ...directive, children } as ResourceDirective;
    }
    case 'html': return fail(position, 'E_MARKDOWN', 'v1 不接受原始 HTML / JSX；示例请放代码块');
    default: fail(position, 'E_MARKDOWN', `v1 未注册节点类型 ${node.type}`);
  }
}

/** 每个定义必须被引用；没有引用的脚注通常是改文字时漏删，发布前就报出来。 */
function footnoteSection(state: FootnoteState, source: SourceText): readonly DocumentNode[] {
  const unused = [...state.definitions].find(([key]) => !state.order.includes(key));
  if (unused) fail(unused[1].position, 'E_REFERENCE', '脚注已定义但正文没有引用它');
  if (!state.order.length) return [];
  const items = state.order.map((key, index): DocumentNode => {
    const definition = state.definitions.get(key);
    if (!definition) throw new Error(`脚注 ${key} 缺少定义`);
    return { type: 'footnoteItem', number: index + 1, children: definition.children, position: definition.position };
  });
  return [{ type: 'footnotes', children: items, position: items[0]?.position ?? source.at(0, 'document') }];
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
    const footnotes: FootnoteState = { order: [], occurrences: new Map(), definitions: new Map() };
    const context: ParseContext = { source, definitions, slugger, container: null, footnotes };
    const body = root.children.slice(1).flatMap((node) => {
      const converted = convertNode(node, context);
      return converted ? [converted] : [];
    });
    const children = [...body, ...footnoteSection(footnotes, source)];
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
