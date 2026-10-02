import { resolveApiBase } from '../composables/useMirrorStatus';
import {
  parseArtifactList,
  parseEcosystemList,
  parseResourceDetail,
  parseResourceList,
  type Artifact,
  type EcosystemSummary,
  type ResourceDetail,
  type ResourceSummary,
} from './downloads';

export class ResourceApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, signal?: AbortSignal): Promise<unknown> {
  const base = resolveApiBase();
  if (!base) throw new Error('资源目录接口未配置');
  const response = await fetch(`${base.replace(/\/+$/, '')}${path}`, { cache: 'no-store', signal });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: unknown };
    throw new ResourceApiError(
      response.status,
      typeof detail.error === 'string' ? detail.error : `资源目录接口不可用（${response.status}）`,
    );
  }
  return (await response.json()) as unknown;
}
export async function loadResources(
  options: {
    query?: string;
    ecosystem?: string;
    site?: string;
    version?: string;
    downloadableOnly?: boolean;
  } = {},
  signal?: AbortSignal,
): Promise<ResourceSummary[]> {
  const params = new URLSearchParams({ limit: '200' });
  if (options.query) params.set('q', options.query);
  if (options.ecosystem) params.set('ecosystem', options.ecosystem);
  if (options.site) params.set('site', options.site);
  if (options.version) params.set('version', options.version);
  if (options.downloadableOnly) params.set('downloadable', '1');
  const items = parseResourceList(await request(`/api/resources?${params}`, signal));
  if (!items) throw new Error('资源目录格式不符');
  return items;
}
export async function loadEcosystems(signal?: AbortSignal): Promise<EcosystemSummary[]> {
  const items = parseEcosystemList(await request('/api/ecosystems', signal));
  if (!items) throw new Error('生态目录格式不符');
  return items;
}
export async function loadResource(id: string, signal?: AbortSignal): Promise<ResourceDetail> {
  const detail = parseResourceDetail(
    await request(`/api/resources/${encodeURIComponent(id)}`, signal),
  );
  if (!detail) throw new Error('文件清单格式不符');
  return detail;
}
export interface FileFilters {
  q?: string;
  package?: string;
  version?: string;
  release?: string;
  arch?: string;
  platform?: string;
  role?: string;
  cursor?: string;
}
export interface FileOptions {
  platforms: string[];
  arches: string[];
  versions: string[];
  releases: string[];
  roles: string[];
}
export interface FilePage {
  items: Artifact[];
  nextCursor: string | null;
}
function parameters(filters: FileFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}
export async function loadFiles(
  id: string,
  origin: string,
  filters: FileFilters = {},
  signal?: AbortSignal,
): Promise<FilePage> {
  const params = parameters(filters);
  params.set('resource', id);
  const raw = (await request(`/api/files?${params}`, signal)) as {
    items?: unknown;
    nextCursor?: unknown;
  };
  const items = parseArtifactList(raw.items, new URL(origin).origin);
  if (!items || (raw.nextCursor !== null && typeof raw.nextCursor !== 'string'))
    throw new Error('数据库文件格式不符');
  return { items, nextCursor: raw.nextCursor as string | null };
}
export async function loadFileOptions(
  id: string,
  filters: FileFilters = {},
  signal?: AbortSignal,
): Promise<FileOptions> {
  const raw = (await request(
    `/api/resources/${encodeURIComponent(id)}/options?${parameters(filters)}`,
    signal,
  )) as Record<string, unknown>;
  for (const key of ['platforms', 'arches', 'versions', 'releases', 'roles'])
    if (
      !Array.isArray(raw[key]) ||
      !(raw[key] as unknown[]).every((value) => typeof value === 'string')
    )
      throw new Error('数据库筛选格式不符');
  return raw as unknown as FileOptions;
}

export interface SiteSummary {
  id: string;
  name: string;
  kind: import('@mirrorn/shared').Mirror['kind'];
  homepageUrl: string;
  aliases: string[];
  probe?: import('@mirrorn/shared').Mirror['probe'];
  resourceCount: number;
  enabled: boolean;
}
function isSite(value: unknown): value is SiteSummary {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.name === 'string' &&
    typeof row.homepageUrl === 'string' &&
    typeof row.kind === 'string' &&
    Array.isArray(row.aliases) &&
    row.aliases.every((alias) => typeof alias === 'string') &&
    typeof row.resourceCount === 'number' &&
    typeof row.enabled === 'boolean'
  );
}
export async function loadSites(signal?: AbortSignal): Promise<SiteSummary[]> {
  const payload = (await request('/api/sites', signal)) as { items?: unknown };
  if (!Array.isArray(payload.items) || !payload.items.every(isSite))
    throw new Error('站点数据库格式不符');
  return payload.items;
}
export async function loadSite(id: string, signal?: AbortSignal): Promise<SiteSummary> {
  const site = await request(`/api/sites/${encodeURIComponent(id)}`, signal);
  if (!isSite(site)) throw new Error('站点数据库格式不符');
  return site;
}
