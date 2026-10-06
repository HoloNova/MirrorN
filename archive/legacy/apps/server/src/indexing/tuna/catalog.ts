//校验结构，遍历分组的 urls，按配置映射软件，把相对路径补成清华完整 URL，按 URL 去重。
import { TunaCatalogPayloadSchema } from '@mirrorn/shared';
import type { Download } from '../../db/installers.js';
import type { RuleSet } from '../rules/load.js';
import { resourceSite } from '../policy.js';
import { SourceError } from '../source.js';
import { normalizeTunaDownload } from './normalize.js';
import { selectRecommendedVersions } from '../recommendations.js';

export const TUNA_ORIGIN = resourceSite('tsinghua').origin;
export const TUNA_CATALOG_URL = `${TUNA_ORIGIN}/static/status/isoinfo.json`;

/** 校验原始路径再标准化，不能让URL构造器提前吞掉../或编码分隔符。 */
export function tunaDownloadUrl(value: string) {
  const path = value.startsWith(`${TUNA_ORIGIN}/`) ? value.slice(TUNA_ORIGIN.length) : value;
  if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path))
    throw new SourceError('官方清单链接超出清华来源或包含异常路径', false);
  const segments = path.split('/').slice(1);
  if (segments.some((s) => !s)) throw new SourceError('官方清单不是文件直链', false);
  const decoded = segments.map((segment) => {
    let text: string;
    try {
      text = decodeURIComponent(segment);
    } catch {
      throw new SourceError('官方清单URL编码异常', false);
    }
    if (
      /[/\\%]/.test(text) ||
      Array.from(text).some((char) => char.codePointAt(0)! < 32 || char.codePointAt(0) === 127) ||
      text === '.' ||
      text === '..'
    )
      throw new SourceError('官方清单链接包含异常路径', false);
    return encodeURIComponent(text);
  });
  return new URL(`/${decoded.join('/')}`, TUNA_ORIGIN);
}

export interface TunaIssue {
  decision: 'rejected' | 'pending';
  reason: string;
  group: string;
  url: string;
  software?: string;
}
export function parseTunaCatalog(raw: unknown, rules: RuleSet) {
  if (!rules.officialCatalog) throw new SourceError('清华官方清单未配置', false);
  const validation = TunaCatalogPayloadSchema.safeParse(raw);
  if (!validation.success) throw new SourceError('清华官方清单结构异常或为空，保留有效数据', true);
  const config = rules.officialCatalog;
  const downloads = new Map<string, { software: string; group: string; download: Download }>();
  const issues: TunaIssue[] = [];
  let links = 0,
    duplicates = 0;
  for (const group of validation.data)
    for (const entry of group.urls) {
      links++;
      const url = tunaDownloadUrl(entry.url);
      const filename = decodeURIComponent(url.pathname.split('/').at(-1)!);
      const exclusion = config.excludedGroups.find((e) => e.group === group.distro);
      if (exclusion || group.category === 'font') {
        issues.push({
          decision: 'rejected',
          reason: exclusion?.reason ?? 'font_out_of_scope',
          group: group.distro,
          url: url.href,
        });
        continue;
      }
      const matches = config.bindings.filter(
        (b) =>
          b.group === group.distro &&
          b.roots.some((root) => url.pathname.startsWith(`/${root}`)) &&
          (!b.filename || new RegExp(b.filename, 'i').test(filename)),
      );
      if (matches.length > 1)
        throw new SourceError(`官方清单软件归属冲突：${group.distro}/${filename}`, false);
      const binding = matches[0];
      if (!binding) {
        issues.push({
          decision: 'pending',
          reason: 'unadapted_software',
          group: group.distro,
          url: url.href,
        });
        continue;
      }
      const result = normalizeTunaDownload(binding, entry.name, url);
      if (result.decision !== 'accepted') {
        issues.push({
          ...result,
          group: group.distro,
          url: url.href,
          software: binding.softwareId,
        });
        continue;
      }
      const previous = downloads.get(url.href);
      if (previous && previous.software !== binding.softwareId)
        throw new SourceError('官方清单同一URL的软件归属冲突', false);
      if (previous) duplicates++;
      else
        downloads.set(url.href, {
          software: binding.softwareId,
          group: group.distro,
          download: result.download,
        });
    }
  const recognized = downloads.size;
  if (!recognized) throw new SourceError('清华官方清单没有可识别下载，保留有效数据', true);
  // 版本策略同样作用于精选清单：只留推荐支线，其余计入rejected，不进资源列表。
  const versions = new Map<string, Set<string>>();
  for (const item of downloads.values()) {
    const list = versions.get(item.software) ?? new Set<string>();
    list.add(item.download.version);
    versions.set(item.software, list);
  }
  const recommended = new Map<string, Set<string>>();
  for (const [software, list] of versions)
    if (list.size > 1)
      recommended.set(software, new Set(selectRecommendedVersions(rules, software, [...list])));
  for (const [url, item] of [...downloads]) {
    const keep = recommended.get(item.software);
    if (!keep || keep.has(item.download.version)) continue;
    downloads.delete(url);
    issues.push({
      decision: 'rejected',
      reason: 'not_recommended_version',
      group: item.group,
      url,
      software: item.software,
    });
  }
  return {
    downloads: [...downloads.values()],
    issues,
    stats: {
      groups: validation.data.length,
      links,
      accepted: downloads.size,
      rejected: issues.filter((i) => i.decision === 'rejected').length,
      pending: issues.filter((i) => i.decision === 'pending').length,
      duplicates,
      filtered: recognized - downloads.size,
    },
  };
}
