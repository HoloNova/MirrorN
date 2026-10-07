import type { Nodes } from 'mdast';
import type {} from 'remark-directive';
import { fail, fieldName, parseSchema, type ContentLocation, type LocatedData } from '../diagnostics.ts';
import { directiveRegistry, isDirectiveName } from '../schema/directives.ts';
import type { DocumentNode, ResourceDirective } from './document-types.ts';
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

/** 正文所处的容器；footnote 不是指令，但同样限制内部能写什么。 */
export type ContainerContext = 'notice' | 'choice' | 'option' | 'details' | 'steps' | 'footnote';

/** 能放进 option／details 的容器：提示和步骤。choice、details、option 不互相嵌套，避免隐藏内容层层叠加。 */
const nestableContainers: readonly string[] = ['notice', 'steps'];

function nestingProblem(parent: ContainerContext | null, name: string, isContainer: boolean): string | undefined {
  switch (parent) {
    case null: return name === 'option' ? 'option 只能直接写在 choice 里' : undefined;
    case 'notice': return 'Notice 内不嵌套资源指令';
    case 'footnote': return '脚注内不嵌套资源指令';
    case 'choice': return name === 'option' ? undefined : 'choice 内只能直接放 option';
    case 'steps': return isContainer ? '步骤内只放一个有序列表，不嵌套容器指令' : undefined;
    case 'option': case 'details': return isContainer && !nestableContainers.includes(name) ? `${parent} 内不嵌套 ${name}（只允许 notice、steps 与下载等叶子指令）` : undefined;
  }
}

/** 容器内容的整体形状：choice 只含 ≥2 个标签不重复的 option；steps 恰好是一个有序列表。 */
export function checkContainerShape(directive: Omit<ResourceDirective, 'children'>, children: readonly DocumentNode[]): void {
  if (directive.name === 'choice') {
    const options = children.filter((child): child is Extract<ResourceDirective, { name: 'option' }> => child.type === 'resourceDirective' && child.name === 'option');
    if (options.length !== children.length) fail(directive.position, 'E_DIRECTIVE', 'choice 内只能直接放 option，不能夹杂其他正文');
    if (options.length < 2) fail(directive.position, 'E_DIRECTIVE', 'choice 至少需要两个 option；只有一项时直接写正文');
    const labels = options.map((option) => option.props.label);
    const repeated = options.find((option, index) => labels.indexOf(option.props.label) !== index);
    if (repeated) fail(repeated.position, 'E_DUPLICATE', `同一个 choice 内 option 标签重复：${repeated.props.label}`);
  }
  if (directive.name === 'steps' && !(children.length === 1 && children[0]?.type === 'list' && children[0].ordered)) {
    fail(directive.position, 'E_DIRECTIVE', 'steps 内容必须恰好是一个有序列表（1. 2. 3.）');
  }
}

/** remark 已完成语法解析；这里只约束更严格的作者写法，绝不替换或生成 HTML。 */
export function parseDirective(node: RawDirective, source: SourceText, parent: ContainerContext | null): Omit<ResourceDirective, 'children'> {
  const offset = node.position?.start.offset ?? 0;
  const position = source.at(offset, `directive.${node.name}`);
  if (node.type === 'textDirective') fail(position, 'E_DIRECTIVE', 'v1 不支持行内指令；叶子指令必须独占一行');
  if (!isDirectiveName(node.name)) fail(position, 'E_DIRECTIVE', `未注册指令 ${node.name}`);
  const definition = directiveRegistry[node.name];
  const container = node.type === 'containerDirective';
  const problem = nestingProblem(parent, node.name, container);
  if (problem) fail(position, 'E_DIRECTIVE', problem);
  if (container !== (definition.kind === 'container')) fail(position, 'E_DIRECTIVE', '容器指令（notice、choice、option、details、steps）用 ::: 开头并显式结束，其他指令是单行 ::');
  const endOfLine = source.text.indexOf('\n', offset);
  const opening = source.text.slice(offset, endOfLine < 0 ? undefined : endOfLine).trimEnd();
  // 容器的冒号数由作者决定（外层比内层多，如 ::::choice 包 :::option），结束行必须与开头一致。
  const colons = container ? opening.match(/^:+/u)?.[0].length ?? 0 : 2;
  const prefix = `${':'.repeat(colons)}${node.name}`;
  if (!opening.startsWith(prefix) || (container && colons < 3)) fail(position, 'E_DIRECTIVE', '指令围栏必须准确：叶子指令两个冒号，容器指令至少三个冒号');
  const remainder = opening.slice(prefix.length);
  if (remainder && (!remainder.startsWith('{') || !remainder.endsWith('}'))) {
    fail(position, 'E_DIRECTIVE', '参数紧随指令名放在 {...} 内，不使用方括号 label 或额外正文');
  }
  if (container) {
    const raw = source.text.slice(offset, node.position?.end.offset);
    const lastLine = raw.split(/\r?\n/).at(-1) ?? '';
    const closingStart = offset + raw.lastIndexOf('\n') + 1;
    const closingInBody = node.children.some((child) => (child.position?.end.offset ?? 0) > closingStart);
    if (closingInBody || !new RegExp(`^(?:[ \\t]*>[ \\t]*)*[ \\t]*:{${colons}}[ \\t]*$`, 'u').test(lastLine)) {
      fail(position, 'E_DIRECTIVE', `${node.name} 必须用独立的 ${':'.repeat(colons)} 显式结束（代码块里的冒号不算围栏）`);
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
