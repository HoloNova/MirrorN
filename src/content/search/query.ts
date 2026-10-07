import { searchLimits } from './limits.ts';

/** 固定 Unicode/大小写/空白规则，不依赖浏览器本地语言。 */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** 输入和查询参数共用上限，保留用户大小写；截断后修复孤立代理项。 */
export function boundedQuery(value: string): string {
  return value.slice(0, searchLimits.queryLength).toWellFormed().replace(/[\u0000-\u001f\u007f]/gu, ' ').trim();
}

export function normalizeQuery(value: string): string {
  // 上限作用于原始输入；NFKC 可能展开字符，不能再截断，否则合法名称无法精确命中。
  return normalizeSearchText(boundedQuery(value));
}
