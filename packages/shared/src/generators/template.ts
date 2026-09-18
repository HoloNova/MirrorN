import type { TemplateVariable } from '../schemas.js';

/**
 * 命令模板只允许 `{{变量}}` 形式，变量名必须与 shared 的 TemplateVariable 枚举一致。
 * 渲染后如果仍有残留占位符，一律视为错误，绝不把 `{{...}}` 原样交给用户复制。
 */
const VARIABLE_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g;

export function findTemplateVariables(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(new RegExp(VARIABLE_PATTERN.source, 'g'))) {
    names.add(match[1]);
  }
  return [...names].sort();
}

export type RenderFailureReason = 'missing-value' | 'unknown-variable';

export type RenderResult =
  { ok: true; text: string } | { ok: false; reason: RenderFailureReason; variables: string[] };

export function renderTemplate(
  text: string,
  values: Partial<Record<TemplateVariable, string | undefined>>,
): RenderResult {
  const unknown = new Set<string>();
  const missing = new Set<string>();

  const rendered = text.replace(
    new RegExp(VARIABLE_PATTERN.source, 'g'),
    (_match, rawName: string) => {
      if (!(rawName in values)) {
        unknown.add(rawName);
        return '';
      }
      const value = values[rawName as TemplateVariable];
      if (value === undefined || value === '') {
        missing.add(rawName);
        return '';
      }
      return value;
    },
  );

  if (unknown.size > 0) {
    return { ok: false, reason: 'unknown-variable', variables: [...unknown].sort() };
  }
  if (missing.size > 0) {
    return { ok: false, reason: 'missing-value', variables: [...missing].sort() };
  }

  const leftovers = findTemplateVariables(rendered);
  if (leftovers.length > 0) {
    return { ok: false, reason: 'unknown-variable', variables: leftovers };
  }

  return { ok: true, text: rendered };
}
