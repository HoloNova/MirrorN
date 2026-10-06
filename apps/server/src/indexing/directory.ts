import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { resourceSite, siteForUrl, sourceUrl } from './policy.js';
import { SourceClient, SourceError } from './source.js';

type Node = DefaultTreeAdapterMap['node'];
export interface DirectoryEntry {
  name: string;
  type: 'directory' | 'file' | 'other';
  size?: number;
  sizeEstimated?: boolean;
}
export function safeName(name: string) {
  return (
    name.length > 0 &&
    name.length <= 512 &&
    name !== '.' &&
    name !== '..' &&
    // eslint-disable-next-line no-control-regex
    !/[/?#\\\u0000-\u001f\u007f]/.test(name) &&
    !/%(?:2f|5c|2e)/i.test(name)
  );
}
function nodes(root: Node): Node[] {
  const result: Node[] = [],
    stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    result.push(node);
    if ('childNodes' in node)
      for (let index = node.childNodes.length - 1; index >= 0; index--)
        stack.push(node.childNodes[index]!);
  }
  return result;
}
function attribute(node: Node, name: string) {
  return 'attrs' in node ? node.attrs.find((attr) => attr.name === name)?.value : undefined;
}
function text(node: Node): string {
  return nodes(node)
    .filter((item) => item.nodeName === '#text')
    .map((item) => ('value' in item ? item.value : ''))
    .join('');
}
function ancestor(node: Node, tag: string): Node | undefined {
  let parent = 'parentNode' in node ? node.parentNode : null;
  while (parent) {
    if (parent.nodeName === tag) return parent;
    parent = 'parentNode' in parent ? parent.parentNode : null;
  }
  return undefined;
}
/** B或无单位整数是精确字节；人类可读单位只作为估算，不冒充Content-Length。 */
function entrySize(value: string): Pick<DirectoryEntry, 'size' | 'sizeEstimated'> {
  const match = value.trim().match(/^([\d,.]+)\s*([KMGTPE]i?B?|B|bytes?)?$/i);
  if (!match) return {};
  const number = Number(match[1]!.replaceAll(',', ''));
  const unit = (match[2] ?? 'B').toUpperCase();
  const power = 'BKMGTPE'.indexOf(unit[0]!);
  const factor = power <= 0 ? 1 : (unit.length === 2 ? 1000 : 1024) ** power;
  const size = Math.round(number * factor);
  if (power <= 0 && !Number.isInteger(number)) return {};
  if (!Number.isFinite(number) || !Number.isSafeInteger(size) || size < 0) return {};
  return { size, ...(power > 0 ? { sizeEstimated: true } : {}) };
}
function sizeForLink(
  link: Node,
  following: WeakMap<Node, Node>,
): Pick<DirectoryEntry, 'size' | 'sizeEstimated'> {
  const row = ancestor(link, 'tr');
  if (row) {
    const cells = nodes(row).filter((node) => node.nodeName === 'td');
    const size = cells.find((cell) => attribute(cell, 'class')?.split(/\s+/).includes('size'));
    if (size) return entrySize(text(size));
    // 通用表格目录不依赖具体站点类名，日期等其它单元格不会匹配大小格式。
    for (const cell of cells) {
      if (nodes(cell).includes(link)) continue;
      const parsed = entrySize(text(cell));
      if (parsed.size !== undefined) return parsed;
    }
  }
  const next = following.get(link);
  if (next?.nodeName === '#text')
    return entrySize(text(next).split('\n')[0]!.trim().split(/\s+/).at(-1) ?? '');
  return {};
}
/** 只解析完整的当前目录页；导航、上级、排序及其它主机链接不进入文件清单。 */
export function parseHtmlDirectory(html: string, directory: string): DirectoryEntry[] {
  const base = sourceUrl(directory);
  if (!base.pathname.endsWith('/') || !/<\/html\s*>/i.test(html))
    throw new SourceError('HTML目录不完整，未发布', false);
  const document = parse(html),
    all = nodes(document);
  const title = all.find((node) => node.nodeName === 'title');
  const heading = title && text(title).match(/Index of\s+(\/[^\s|<]*)/i);
  let titlePath: string | undefined;
  try {
    titlePath = heading ? decodeURIComponent(heading[1]!) : undefined;
  } catch {
    throw new SourceError('HTML目录路径编码无效，未发布', false);
  }
  if (titlePath !== decodeURIComponent(base.pathname))
    throw new SourceError('HTML不是当前目录清单，未发布', false);
  const result = new Map<string, DirectoryEntry>();
  const following = new WeakMap<Node, Node>();
  for (const node of all.filter((n) => n.nodeName === 'pre'))
    if ('childNodes' in node)
      for (let index = 1; index < node.childNodes.length; index++)
        following.set(node.childNodes[index - 1]!, node.childNodes[index]!);
  let listingFound = false;
  for (const link of all.filter((node) => node.nodeName === 'a')) {
    if (!ancestor(link, 'table') && !ancestor(link, 'pre')) continue;
    listingFound = true;
    const href = attribute(link, 'href');
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(base.pathname)
    )
      continue;
    const isDirectory = url.pathname.endsWith('/');
    let name: string;
    try {
      name = decodeURIComponent(url.pathname.slice(base.pathname.length).replace(/\/$/, ''));
    } catch {
      throw new SourceError('HTML文件名编码无效，未发布', false);
    }
    if (!name) continue;
    if (!safeName(name)) throw new SourceError('HTML文件名超出直接目录范围，未发布', false);
    const entry: DirectoryEntry = {
      name,
      type: isDirectory ? 'directory' : 'file',
      ...(!isDirectory ? sizeForLink(link, following) : {}),
    };
    // 已核实的TUNA目录会把失效ISO软链接作为几十字节文件列出；它不可能是ISO镜像。
    if (
      entry.type !== 'directory' &&
      /\.iso$/i.test(name) &&
      entry.size !== undefined &&
      entry.size < 34816
    )
      continue;
    const previous = result.get(name);
    if (previous && JSON.stringify(previous) !== JSON.stringify(entry))
      throw new SourceError('HTML目录条目互相冲突，未发布', false);
    result.set(name, entry);
  }
  if (!listingFound) throw new SourceError('HTML目录缺少文件列表，未发布', false);
  return [...result.values()];
}
export function directoryApi(directory: string) {
  const url = sourceUrl(directory);
  const site = resourceSite(siteForUrl(url.href)!);
  return site.listing === 'json' ? `${site.origin}/files${url.pathname}` : url.href;
}
export async function directoryEntries(
  source: SourceClient,
  directory: string,
): Promise<DirectoryEntry[]> {
  const site = resourceSite(siteForUrl(sourceUrl(directory).href)!);
  if (site.listing === 'html')
    return parseHtmlDirectory(await source.html(directoryApi(directory)), directory);
  const raw: unknown = await source.json(directoryApi(directory));
  if (!Array.isArray(raw)) throw new SourceError('软件目录不是完整JSON文件列表', false);
  const seen = new Set<string>();
  return raw.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new SourceError('文件列表条目无效', false);
    const row = value as DirectoryEntry;
    if (
      typeof row.name !== 'string' ||
      !safeName(row.name) ||
      !['directory', 'file', 'other'].includes(row.type) ||
      seen.has(row.name)
    )
      throw new SourceError('文件列表身份、类型或唯一性无效', false);
    seen.add(row.name);
    if (row.size != null && (!Number.isSafeInteger(row.size) || row.size < 0))
      throw new SourceError('文件大小元数据无效', false);
    return { name: row.name, type: row.type, ...(row.size == null ? {} : { size: row.size }) };
  });
}
