import type { Nodes } from 'mdast';
import type {} from 'remark-directive';
import { fail, fieldName, parseSchema, type ContentLocation, type LocatedData } from '../diagnostics.ts';
import { directiveRegistry, isDirectiveName } from '../schema/directives.ts';
import type { ResourceDirective } from './document-types.ts';
import type { SourceText } from './source-text.ts';

type RawDirective = Extract<Nodes, { type: 'containerDirective' | 'leafDirective' | 'textDirective' }>;

function attributePositions(raw: string, offset: number, name: string, source: SourceText): Readonly<Record<string, ContentLocation>> {
  let rest = raw;
  let cursor = offset;
  let entries: readonly (readonly [string, ContentLocation])[] = [];
  while (rest.length) {
    const whitespace = rest.match(/^[ \t]+/)?.[0] ?? '';
    rest = rest.slice(whitespace.length);
    cursor += whitespace.length;
    if (!rest) break;
    if (entries.length && !whitespace) fail(source.at(cursor, `directive.${name}`), 'E_DIRECTIVE', '参数之间必须用空白分隔');
    const attribute = rest.match(/^([a-z][a-z0-9-]*)="[^"\r\n]*"/u);
    if (!attribute?.[1]) fail(source.at(cursor, `directive.${name}`), 'E_DIRECTIVE', '参数必须写成 name="value"，不支持 label、简写或表达式');
    const key = attribute[1];
    if (entries.some(([existing]) => existing === key)) fail(source.at(cursor, `directive.${name}.${key}`), 'E_DIRECTIVE', '指令参数不得重复');
    entries = [...entries, [key, source.at(cursor, `directive.${name}.${key}`)]];
    rest = rest.slice(attribute[0].length);
    cursor += attribute[0].length;
  }
  return Object.fromEntries(entries);
}

/** remark 已完成语法解析；这里只约束更严格的作者写法，绝不替换或生成 HTML。 */
export function parseDirective(node: RawDirective, source: SourceText, insideNotice: boolean): Omit<ResourceDirective, 'children'> {
  const offset = node.position?.start.offset ?? 0;
  const position = source.at(offset, `directive.${node.name}`);
  if (node.type === 'textDirective') fail(position, 'E_DIRECTIVE', 'v1 不支持行内指令；叶子指令必须独占一行');
  if (insideNotice) fail(position, 'E_DIRECTIVE', 'Notice 内不嵌套资源指令');
  if (!isDirectiveName(node.name)) fail(position, 'E_DIRECTIVE', `未注册指令 ${node.name}`);
  const definition = directiveRegistry[node.name];
  const container = node.type === 'containerDirective';
  if (container !== (definition.kind === 'container')) fail(position, 'E_DIRECTIVE', '只有 notice 使用 ::: 容器，其他指令使用 ::');
  const endOfLine = source.text.indexOf('\n', offset);
  const opening = source.text.slice(offset, endOfLine < 0 ? undefined : endOfLine).trimEnd();
  const prefix = `${container ? ':::' : '::'}${node.name}`;
  if (!opening.startsWith(prefix)) fail(position, 'E_DIRECTIVE', '指令围栏必须准确使用两个或三个冒号');
  const remainder = opening.slice(prefix.length);
  if (remainder && (!remainder.startsWith('{') || !remainder.endsWith('}'))) {
    fail(position, 'E_DIRECTIVE', '参数紧随指令名放在 {...} 内，不使用方括号 label 或额外正文');
  }
  if (container) {
    const raw = source.text.slice(offset, node.position?.end.offset);
    const lastLine = raw.split(/\r?\n/).at(-1) ?? '';
    const closingStart = offset + raw.lastIndexOf('\n') + 1;
    const closingInBody = node.children.some((child) => (child.position?.end.offset ?? 0) > closingStart);
    if (closingInBody || !/^(?:[ \t]*>[ \t]*)*[ \t]*:::[ \t]*$/u.test(lastLine)) {
      fail(position, 'E_DIRECTIVE', 'Notice 必须用独立的 ::: 显式结束（代码块里的冒号不算围栏）');
    }
  } else if (node.children.length) fail(position, 'E_DIRECTIVE', '叶子指令不接受 label 或正文');
  const positions = attributePositions(remainder ? remainder.slice(1, -1) : '', offset + prefix.length + 1, node.name, source);
  const data: LocatedData = {
    value: node.attributes ?? {},
    locate: (path) => positions[String(path[0])] ?? { ...position, field: `directive.${node.name}.${fieldName(path)}` },
  };
  const props = parseSchema(definition.schema, data);
  // 名称和 props 来自同一个注册表条目，唯一类型断言不接受调用者提供的未知字段。
  return { type: 'resourceDirective', name: node.name, component: definition.component, props, position, attributePositions: positions } as Omit<ResourceDirective, 'children'>;
}

function inlineCodeContains(node: Nodes, offset: number): boolean {
  if (node.type === 'inlineCode') return offset >= (node.position?.start.offset ?? 0) && offset < (node.position?.end.offset ?? 0);
  return 'children' in node && node.children.some((child) => inlineCodeContains(child, offset));
}

export function rejectMalformedDirective(node: Extract<Nodes, { type: 'paragraph' }>, source: SourceText): void {
  const start = node.position?.start.offset ?? 0;
  const raw = source.text.slice(start, node.position?.end.offset);
  for (const match of raw.matchAll(/^(?:[ \t]*>[ \t]*)*[ \t]*::/gm)) {
    const offset = start + (match.index ?? 0) + match[0].lastIndexOf('::');
    if (!inlineCodeContains(node, offset)) fail(source.at(offset, 'document'), 'E_DIRECTIVE', '独立行指令格式不完整；示例请放代码块或行内代码');
  }
}
