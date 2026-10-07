import { isAlias, isMap, isNode, isPair, isScalar, isSeq, parseDocument, visit } from 'yaml';
import { ContentError, fail, fieldName, type FieldPath, type LocatedData } from '../diagnostics.ts';
import { contentLimits } from '../limits.ts';
import { nearestPathNode, type SourceText } from './source-text.ts';

export function parseYaml(source: SourceText, value: string, offset: number): LocatedData {
  const document = parseDocument(value, { schema: 'core', uniqueKeys: true, strict: true, customTags: [] });
  const syntaxIssues = [...document.errors, ...document.warnings].map((error) => ({
    ...source.at(offset + (error.pos[0] ?? 0), 'frontMatter'), code: 'E_YAML', message: error.message,
  }));
  if (syntaxIssues.length) throw new ContentError(syntaxIssues);
  visit(document, (key, node, path) => {
    const depth = path.filter((parent) => isMap(parent) || isSeq(parent)).length + (isMap(node) || isSeq(node) ? 1 : 0);
    if (depth > contentLimits.dataDepth) fail(source.at(offset, 'frontMatter'), 'E_BUDGET', 'YAML 嵌套超过 32 层');
    if (isAlias(node)) fail(source.at(offset + (node.range?.[0] ?? 0), 'frontMatter'), 'E_YAML', 'Front Matter 不支持别名');
    if (isNode(node) && 'anchor' in node && node.anchor) {
      fail(source.at(offset + (node.range?.[0] ?? 0), 'frontMatter'), 'E_YAML', 'Front Matter 不支持锚点');
    }
    if (isNode(node) && node.tag && !/^tag:yaml\.org,2002:(?:str|map|seq|int|float|bool|null)$/.test(node.tag)) {
      fail(source.at(offset + (node.range?.[0] ?? 0), 'frontMatter'), 'E_YAML', 'Front Matter 不支持自定义标签');
    }
    if (key === 'key' && (!isScalar(node) || typeof node.value !== 'string')) {
      fail(source.at(offset + (isNode(node) ? node.range?.[0] ?? 0 : 0), 'frontMatter'), 'E_YAML', '映射键必须是字符串');
    }
    if (isScalar(node) && typeof node.value === 'number' && !Number.isFinite(node.value)) {
      fail(source.at(offset + (node.range?.[0] ?? 0), 'frontMatter'), 'E_YAML', '不能使用 Infinity 或 NaN');
    }
  });
  const find = (path: FieldPath) => {
    let current: unknown = document.contents;
    for (const part of path) {
      if (isMap(current)) {
        const pair = current.items.find((entry) => isScalar(entry.key) && entry.key.value === part);
        current = pair?.value;
      } else if (isSeq(current) && typeof part === 'number') current = current.items[part];
      else return undefined;
      if (isPair(current)) current = current.value;
    }
    return isNode(current) ? current : undefined;
  };
  const data: unknown = document.toJS({ maxAliasCount: 0 });
  return {
    value: data,
    locate: (path) => {
      const node = nearestPathNode(path, find);
      return source.at(offset + (node?.range?.[0] ?? 0), `frontMatter.${fieldName(path)}`);
    },
  };
}
