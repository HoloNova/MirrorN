import { fieldName, type ContentLocation, type FieldPath } from '../diagnostics.ts';

export interface SourceText {
  readonly text: string;
  readonly resourceId: string;
  readonly file: string;
  readonly at: (offset: number, field?: string) => ContentLocation;
}

export function sourceText(rawText: string, resourceId: string, file: string): SourceText {
  // CRLF / CR 都按 Markdown 标准归一为 LF，源码行列保持与编辑器一致；JSON 转义字符串不受影响。
  const text = rawText.replace(/\r\n?/g, '\n');
  const lineStarts = [0, ...Array.from(text.matchAll(/\n/g), (match) => (match.index ?? 0) + 1)];
  const at = (rawOffset: number, field = '$'): ContentLocation => {
    const offset = Math.max(0, Math.min(rawOffset, text.length));
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if ((lineStarts[middle] ?? 0) <= offset) low = middle;
      else high = middle;
    }
    return { resourceId, file, line: low + 1, column: offset - (lineStarts[low] ?? 0) + 1, field };
  };
  return { text, resourceId, file, at };
}

export function nearestPathNode<T>(path: FieldPath, find: (path: FieldPath) => T | undefined): T | undefined {
  for (let length = path.length; length >= 0; length -= 1) {
    const node = find(path.slice(0, length));
    if (node !== undefined) return node;
  }
  return undefined;
}

export function locationFor(source: SourceText, offset: number, path: FieldPath): ContentLocation {
  return source.at(offset, fieldName(path));
}
