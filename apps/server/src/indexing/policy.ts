/** 支持的准确来源主机；参与采集仍须通过审核绑定和数据库的站点软件关联。 */
export const RESOURCE_SITES = {
  pku: { origin: 'https://mirrors.pku.edu.cn', listing: 'json', region: 'CN' },
  tsinghua: { origin: 'https://mirrors.tuna.tsinghua.edu.cn', listing: 'html', region: 'CN' },
} as const;
export const PKU_ORIGIN = RESOURCE_SITES.pku.origin;
export const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const INDEX_CONCURRENCY = 8;
export const SOURCE_CONCURRENCY = 4;
export const SOURCE_CACHE_ENTRIES = 64;
export function resourceSite(site: string) {
  if (!Object.hasOwn(RESOURCE_SITES, site)) throw new Error('禁止采集未启用站点');
  return RESOURCE_SITES[site as keyof typeof RESOURCE_SITES];
}
export function siteForUrl(value: string) {
  const origin = new URL(value).origin;
  return Object.entries(RESOURCE_SITES).find(([, site]) => site.origin === origin)?.[0];
}

/** 准确绑定当前站点与目录，不因为另一个站点也在允许表就允许跨站写入。 */
export function sourceUrl(value: string, root?: string): URL {
  const base = new URL(root ?? `${new URL(value, `${PKU_ORIGIN}/`).origin}/`);
  const url = new URL(value, base);
  const path = decodeURIComponent(url.pathname);
  if (
    !siteForUrl(base.href) ||
    url.origin !== base.origin ||
    base.username ||
    base.password ||
    url.username ||
    url.password ||
    url.search ||
    !url.pathname.startsWith(base.pathname) ||
    path.includes('\\') ||
    Array.from(path).some((char) => char.codePointAt(0)! < 32 || char.codePointAt(0) === 127) ||
    /(?:^|\/)\.\.(?:\/|$)/.test(path)
  )
    throw new Error('源站链接超出允许范围');
  url.hash = '';
  return url;
}
