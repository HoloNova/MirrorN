import type { output, ZodType } from 'zod';

export type FieldPath = readonly (string | number)[];

export interface ContentLocation {
  readonly resourceId: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly field: string;
}

export interface ContentIssue extends ContentLocation {
  readonly code: string;
  readonly message: string;
}

export interface LocatedData {
  readonly value: unknown;
  readonly locate: (path: FieldPath) => ContentLocation;
}

export function formatIssue(issue: ContentIssue): string {
  return `${issue.file}:${issue.line}:${issue.column} [${issue.resourceId}] ${issue.code} ${issue.field}: ${issue.message}`;
}

export class ContentError extends Error {
  readonly issues: readonly ContentIssue[];

  constructor(issues: readonly ContentIssue[]) {
    super(issues.map(formatIssue).join('\n'));
    this.name = 'ContentError';
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

export function fail(location: ContentLocation, code: string, message: string): never {
  throw new ContentError([{ ...location, code, message }]);
}

export function fieldName(path: FieldPath): string {
  return path.reduce<string>((name, part) => (
    typeof part === 'number' ? `${name}[${part}]` : `${name}${name ? '.' : ''}${part}`
  ), '') || '$';
}

/** 同一位置适配器供 Zod 和跨文件规则使用，避免错误退化成无行号的字符串。 */
export function parseSchema<S extends ZodType>(schema: S, data: LocatedData): output<S> {
  const result = schema.safeParse(data.value);
  if (result.success) return result.data as output<S>;
  const issues = result.error.issues.flatMap((issue) => {
    const path = issue.path.map((part) => typeof part === 'number' ? part : String(part));
    const paths = issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => [...path, key]) : [path];
    return paths.map((entry) => ({
      ...data.locate(entry), code: 'E_SCHEMA', message: issue.message,
    }));
  });
  throw new ContentError(issues);
}

export function issuesFrom(error: unknown, location: ContentLocation): readonly ContentIssue[] {
  if (error instanceof ContentError) return error.issues;
  return [{ ...location, code: 'E_IO', message: error instanceof Error ? error.message : String(error) }];
}
