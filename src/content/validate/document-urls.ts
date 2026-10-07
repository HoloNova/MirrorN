import { fail, type ContentLocation } from '../diagnostics.ts';
import { assetPathProblem, httpUrlProblem } from '../schema/primitives.ts';

import { sitePagePaths } from '../schema/document-contract.ts';

export type DocumentTarget =
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'resource'; readonly id: string; readonly anchor?: string; readonly url: string }
  | { readonly kind: 'site'; readonly path: string; readonly anchor?: string; readonly url: string }
  | { readonly kind: 'asset'; readonly path: string; readonly url: string };

function decode(value: string, location: ContentLocation): string {
  try { return decodeURIComponent(value); }
  catch { fail(location, 'E_URL', 'URL 有无效的百分号编码'); }
}

function internalTarget(rawPath: string, anchor: string, resourceId: string, location: ContentLocation, query = ''): DocumentTarget {
  const path = rawPath.startsWith('./') ? rawPath.slice(2) : rawPath;
  const encodedAnchor = anchor ? `#${encodeURIComponent(anchor)}` : '';
  if (!path || path === 'index.md') return { kind: 'resource', id: resourceId, anchor: anchor || undefined, url: `${query}${encodedAnchor}` || '#' };
  if (path.startsWith('//') || path.split('/').some((part) => part === '.' || part === '..')) {
    fail(location, 'E_URL', '站内链接不能使用协议相对地址、. 或 .. 路径段');
  }
  const resource = path.match(/^\/resources\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/)?$/u);
  if (resource?.[1]) return { kind: 'resource', id: resource[1], anchor: anchor || undefined, url: `/resources/${resource[1]}/${query}${encodedAnchor}` };
  const sitePath = path === '/about' || path === '/resources' ? `${path}/` : path;
  if (sitePagePaths.includes(sitePath as (typeof sitePagePaths)[number])) return { kind: 'site', path: sitePath, anchor: anchor || undefined, url: `${sitePath}${query}${encodedAnchor}` };
  const localPath = path.startsWith('./') ? path.slice(2) : path;
  const problem = assetPathProblem(localPath);
  if (problem || anchor || query) fail(location, 'E_URL', problem ?? '本地附件链接不使用查询参数或锚点');
  return { kind: 'asset', path: localPath, url: localPath.split('/').map(encodeURIComponent).join('/') };
}

/** 返回可检查的目标，不请求任何 URL。相对附件必须留在当前资源，跨资源使用稳定页面地址。 */
export function documentTarget(value: string, resourceId: string, location: ContentLocation, siteUrl?: string | null): DocumentTarget {
  if (!value || value.length > 4096 || /[\u0000-\u001f\u007f\\]/u.test(value)) fail(location, 'E_URL', '链接为空、过长或包含非法字符');
  if (/^https?:\/\//i.test(value)) {
    const problem = httpUrlProblem(value);
    if (problem) fail(location, 'E_URL', problem);
    const url = new URL(value);
    if (!siteUrl || url.origin !== new URL(siteUrl).origin) return { kind: 'external', url: url.href };
    return internalTarget(decode(url.pathname, location), decode(url.hash.slice(1), location), resourceId, location, url.search);
  }
  const fragmentAt = value.indexOf('#');
  const beforeFragment = fragmentAt < 0 ? value : value.slice(0, fragmentAt);
  const queryAt = beforeFragment.indexOf('?');
  const path = decode(queryAt < 0 ? beforeFragment : beforeFragment.slice(0, queryAt), location);
  const anchor = decode(fragmentAt < 0 ? '' : value.slice(fragmentAt + 1), location);
  const query = queryAt < 0 ? '' : beforeFragment.slice(queryAt);
  if (query) {
    const problem = httpUrlProblem(new URL(query, 'https://mirrorn.invalid/').href);
    if (problem) fail(location, 'E_URL', problem);
  }
  return internalTarget(path, anchor, resourceId, location, query);
}
