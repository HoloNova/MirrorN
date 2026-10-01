/** 单站试点开关：调度、入库和查询共用；不影响测速。 */
export const ENABLED_RESOURCE_SITE = 'pku';
export const PKU_ORIGIN = 'https://mirrors.pku.edu.cn';
export const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function assertEnabledResource(id: string): void {
  if (!id.startsWith(`${ENABLED_RESOURCE_SITE}:`)) throw new Error('资源站点未启用');
}

/** 源站访问只能来自后台。路径来源须落在已审核的仓库根下。 */
export function sourceUrl(value: string, root = `${PKU_ORIGIN}/`): URL {
  const url = new URL(value, root);
  const base = new URL(root);
  if (
    url.origin !== PKU_ORIGIN ||
    base.origin !== PKU_ORIGIN ||
    url.username ||
    url.password ||
    !url.pathname.startsWith(base.pathname) ||
    decodeURIComponent(url.pathname).includes('\\') ||
    Array.from(decodeURIComponent(url.pathname)).some((char) => char.codePointAt(0)! < 32) ||
    /(?:^|\/)\.\.(?:\/|$)/.test(decodeURIComponent(url.pathname))
  )
    throw new Error('源站链接超出允许范围');
  url.hash = '';
  return url;
}

export type FileRole = 'installer' | 'iso' | 'package' | 'firmware' | 'source';
export interface IndexedFile {
  packageName: string;
  version: string;
  filename: string;
  url: string;
  size: number | null;
  role: FileRole;
  platform: string;
  arch: string;
  format: string;
  checksum?: { algorithm: string; value: string };
  compatibility?: Record<string, unknown>;
  mtime?: string;
}

export interface ScopeSpec {
  resourceId: string;
  protocol: string;
  indexUrl: string;
  baseUrl: string;
  release?: string;
  component?: string;
  architecture?: string;
  discoveryEpoch?: number;
}

/** PEP503的包名身份规则；采集和数据库查询使用同一种规范化。 */
export function normalizePythonName(value: string): string {
  return value.toLowerCase().replace(/[-_.]+/g, '-');
}
