import type { PublishedResource } from '../registry/types.ts';
import type { FileEntry } from './sources.ts';
import { resolveGroup } from './sources.ts';

export function dimensionKey(value: string | undefined): string {
  return value === undefined ? 'missing' : `value:${value}`;
}

/** 候选顺序来自 artifact 数组；来源顺序来自 group，绝不做版本字符串比较。 */
export function downloadChoices(resource: PublishedResource, groupId: string) {
  const { group, entries } = resolveGroup(resource, groupId);
  const files = entries.map((entry) => {
    if (entry.kind !== 'file') throw new Error(`DownloadSelect 的 ${entry.id} 不是文件入口`);
    return entry;
  });
  const artifacts = resource.data.artifacts.filter((artifact) => files.some((file) => file.artifact.id === artifact.id));
  return Object.freeze({
    group, entries: Object.freeze(files), artifacts: Object.freeze(artifacts),
    versions: Object.freeze([...new Set([...artifacts.map((artifact) => artifact.version), ...(resource.metadata.defaultVersion ? [resource.metadata.defaultVersion] : [])])]),
    platforms: Object.freeze([...new Set(artifacts.map((artifact) => artifact.platform))]),
    architectures: Object.freeze([...new Set(artifacts.map((artifact) => artifact.arch))]),
    defaultVersion: resource.metadata.defaultVersion ? dimensionKey(resource.metadata.defaultVersion) : 'all',
  });
}

export function artifactDescription(entry: FileEntry): string {
  const { artifact } = entry;
  return [artifact.label, artifact.version ?? '版本未注明', artifact.platform ?? '平台未注明', artifact.arch ?? '架构未注明'].join(' / ');
}

export function formatByteLength(bytes: number | undefined): string {
  if (bytes === undefined) return '大小未注明';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const;
  const power = bytes > 0 ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0;
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: power ? 2 : 0 }).format(bytes / 1024 ** power)} ${units[power]}`;
}
