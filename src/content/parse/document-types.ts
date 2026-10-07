import type { ContentLocation } from '../diagnostics.ts';
import type { CodeLanguageId } from '../schema/code-blocks.ts';
import type { DirectiveName, DirectiveProps, directiveRegistry } from '../schema/directives.ts';

interface PositionedNode {
  readonly position: ContentLocation;
}

export type ResourceDirective = {
  [N in DirectiveName]: PositionedNode & {
    readonly type: 'resourceDirective';
    readonly name: N;
    readonly component: (typeof directiveRegistry)[N]['component'];
    readonly props: DirectiveProps<N>;
    readonly attributePositions: Readonly<Record<string, ContentLocation>>;
    readonly children: readonly DocumentNode[];
  };
}[DirectiveName];

export interface DocumentHeading {
  readonly id: string;
  readonly depth: 2 | 3 | 4 | 5 | 6;
  readonly text: string;
  readonly position: ContentLocation;
}

/** 不保留原 AST 的 data、HTML 或未知属性；渲染器只消费这些已限定节点。 */
export type DocumentNode = PositionedNode & (
  | { readonly type: 'text' | 'inlineCode'; readonly value: string }
  | { readonly type: 'code'; readonly value: string; readonly language: CodeLanguageId; readonly title: string | null }
  | { readonly type: 'break' | 'thematicBreak' }
  | { readonly type: 'paragraph' | 'strong' | 'emphasis' | 'delete' | 'blockquote' | 'tableRow' | 'tableCell'; readonly children: readonly DocumentNode[] }
  | { readonly type: 'heading'; readonly id: string; readonly depth: 2 | 3 | 4 | 5 | 6; readonly text: string; readonly children: readonly DocumentNode[] }
  | { readonly type: 'list'; readonly ordered: boolean; readonly start: number | null; readonly spread: boolean; readonly children: readonly DocumentNode[] }
  | { readonly type: 'listItem'; readonly checked: boolean | null; readonly spread: boolean; readonly children: readonly DocumentNode[] }
  | { readonly type: 'table'; readonly align: readonly ('left' | 'right' | 'center' | null)[]; readonly children: readonly DocumentNode[] }
  | { readonly type: 'link'; readonly url: string; readonly title: string | null; readonly children: readonly DocumentNode[] }
  | { readonly type: 'image'; readonly url: string; readonly title: string | null; readonly alt: string }
  /** 脚注编号按正文中首次引用的顺序；occurrence 区分同一脚注的多次引用，供返回链接定位。 */
  | { readonly type: 'footnoteReference'; readonly number: number; readonly occurrence: number }
  /** 所有脚注定义收集成文末一个节点，这样链接、图片等既有遍历校验不用特殊处理脚注。 */
  | { readonly type: 'footnotes'; readonly children: readonly DocumentNode[] }
  | { readonly type: 'footnoteItem'; readonly number: number; readonly children: readonly DocumentNode[] }
  | ResourceDirective
);

export interface DocumentDefinition {
  readonly identifier: string;
  readonly url: string;
  readonly position: ContentLocation;
}

export interface ResourceDocument {
  readonly children: readonly DocumentNode[];
  readonly headings: readonly DocumentHeading[];
  readonly definitions: readonly DocumentDefinition[];
}

export function documentNodes(nodes: readonly DocumentNode[]): readonly DocumentNode[] {
  return nodes.flatMap((node) => [node, ...('children' in node ? documentNodes(node.children) : [])]);
}
