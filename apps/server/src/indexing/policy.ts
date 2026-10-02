/** 单站试点开关；不影响既有测速。 */
export const ENABLED_RESOURCE_SITE = 'pku';
export const PKU_ORIGIN = 'https://mirrors.pku.edu.cn';
export const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** 后台HTTP及入库链接都只能落在审核的软件目录内。 */
export function sourceUrl(value: string, root = `${PKU_ORIGIN}/`): URL {
  const url = new URL(value, root),
    base = new URL(root);
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
