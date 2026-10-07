import type { DeepReadonly, PublishedResource } from '../registry/types.ts';
import type { Artifact, ResourceSource } from '../schema/sources.ts';
import { resolveAsset } from './assets.ts';

type SourceInfo = Pick<ResourceSource, 'id' | 'type' | 'label' | 'health' | 'note' | 'checkedAt'>;
export type FileEntry = Readonly<SourceInfo & {
  kind: 'file'; action: string; href: string; artifact: DeepReadonly<Artifact>;
  downloadName?: string; byteLength?: number;
}>;
export type PageEntry = Readonly<SourceInfo & { kind: 'page'; action: string; href: string }>;
export type CommandEntry = Readonly<SourceInfo & {
  kind: 'command'; action: string; command: string; shell: string; packageManager: string; href?: string;
}>;
export type ResolvedSource = FileEntry | PageEntry | CommandEntry;

export function requireItem<T extends { readonly id: string }>(items: readonly T[], id: string, kind: string): T {
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new Error(`已校验数据缺少${kind} ${id}`);
  return item;
}

function fileEntry(resource: PublishedResource, source: DeepReadonly<ResourceSource>, artifactId: string, href: string, downloadName?: string, byteLength?: number): FileEntry {
  const artifact = requireItem(resource.data.artifacts, artifactId, '产物');
  return Object.freeze({
    id: source.id, type: source.type, label: source.label, health: source.health, note: source.note, checkedAt: source.checkedAt,
    kind: 'file', action: source.type === 'repository' ? '下载源码包' : '下载文件', href, artifact, downloadName,
    byteLength: byteLength ?? artifact.fileSize,
  });
}

function pageAction(source: DeepReadonly<ResourceSource>): string {
  switch (source.type) {
    case 'repository': return '访问仓库';
    case 'release': return '访问发布页';
    case 'mirror': return '访问镜像页面';
    case 'external-storage': return '访问存储页面';
    default: return '访问下载页';
  }
}

/** 只解释维护者提供的类型和目标，不请求网络、不自动跳转、不推断“最新版本”。 */
export function resolveSource(resource: PublishedResource, id: string): ResolvedSource {
  const source = requireItem(resource.data.sources, id, '来源');
  if (source.type === 'package-manager') {
    return Object.freeze({ ...source, kind: 'command', action: '安装命令', command: source.installCommand, href: source.url });
  }
  if (source.type === 'local') {
    const asset = requireItem(resource.data.assets, source.assetId, '附件');
    const resolved = resolveAsset(resource, asset.path);
    return fileEntry(resource, source, source.artifactId, resolved.href, asset.downloadName, resolved.file.byteLength);
  }
  if (source.type === 'direct') return fileEntry(resource, source, source.artifactId, source.url);
  if ('target' in source && source.target !== 'page') {
    if (!source.artifactId) throw new Error(`文件来源 ${source.id} 缺少产物`);
    return fileEntry(resource, source, source.artifactId, source.url);
  }
  return Object.freeze({ ...source, kind: 'page', action: pageAction(source), href: source.url });
}

export function resolveGroup(resource: PublishedResource, id: string) {
  const group = requireItem(resource.data.groups, id, '分组');
  return Object.freeze({ group, entries: Object.freeze(group.sourceIds.map((sourceId) => resolveSource(resource, sourceId))) });
}

export function resolveDownload(resource: PublishedResource, id: string): FileEntry {
  const entry = resolveSource(resource, id);
  if (entry.kind !== 'file') throw new Error(`Download 不能使用非文件来源 ${id}`);
  return entry;
}
