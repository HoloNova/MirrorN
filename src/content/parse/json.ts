import {
  findNodeAtLocation, getNodeValue, parseTree, printParseErrorCode, visit,
  type Node as JsonNode, type ParseError,
} from 'jsonc-parser';
import { ContentError, fail, fieldName, type FieldPath, type LocatedData } from '../diagnostics.ts';
import { contentLimits } from '../limits.ts';
import { nearestPathNode, type SourceText } from './source-text.ts';

const jsonOptions = { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false };

function checkDuplicateKeys(node: JsonNode, source: SourceText, path: FieldPath = []): void {
  if (node.type === 'object') {
    const properties = node.children ?? [];
    const keys = properties.map((property) => String(property.children?.[0]?.value));
    const first = new Map(keys.map((key, index) => [key, index] as const).toReversed());
    const duplicates = properties.flatMap((property, index) => {
      const key = keys[index] ?? '';
      if (first.get(key) === index) return [];
      return [{ ...source.at(property.offset, fieldName([...path, key])), code: 'E_JSON', message: `重复 JSON 键 ${key}` }];
    });
    if (duplicates.length) throw new ContentError(duplicates);
    for (const property of properties) {
      const child = property.children?.[1];
      if (child) checkDuplicateKeys(child, source, [...path, String(property.children?.[0]?.value)]);
    }
  } else if (node.type === 'array') {
    (node.children ?? []).forEach((child, index) => checkDuplicateKeys(child, source, [...path, index]));
  }
}

export function parseJson(source: SourceText): LocatedData {
  const depthCheck = (offset: number, _length: number, _line: number, _column: number, path: () => (string | number)[]) => {
    if (path().length + 1 > contentLimits.dataDepth) {
      fail(source.at(offset, fieldName(path())), 'E_BUDGET', 'JSON 嵌套超过 32 层');
    }
  };
  // 在递归建树之前利用库的解析事件检查深度，不另写 JSON tokenizer。
  visit(source.text, { onObjectBegin: depthCheck, onArrayBegin: depthCheck }, jsonOptions);
  const errors: ParseError[] = [];
  const tree = parseTree(source.text, errors, jsonOptions);
  if (errors.length) {
    throw new ContentError(errors.map((error) => ({
      ...source.at(error.offset), code: 'E_JSON', message: printParseErrorCode(error.error),
    })));
  }
  if (!tree) fail(source.at(0), 'E_JSON', 'sources.json 必须包含 JSON 对象');
  checkDuplicateKeys(tree, source);
  return {
    value: getNodeValue(tree) as unknown,
    locate: (path) => {
      const node = nearestPathNode(path, (entry) => findNodeAtLocation(tree, [...entry]));
      return source.at(node?.offset ?? 0, fieldName(path));
    },
  };
}
