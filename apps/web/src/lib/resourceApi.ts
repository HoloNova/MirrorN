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
  params.set('limit', '10');
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

export interface CatalogItem {
  id: string;
  type: 'software' | 'ecosystem';
  name: string;
  ecosystemId: string;
  ecosystemLabel: string;
  kind: string;
  softwareCount: number;
  siteCount: number;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}
export interface SiteEntry {
  id: string;
  softwareId: string;
  name: string;
  ecosystemLabel: string;
  kind: string;
  artifactCount: number;
}
export interface DownloadCandidate {
  id: string;
  siteId: string;
  siteName: string;
  downloadEntry: string;
  region: 'CN' | 'unknown';
  artifactCount: number;
  probe?: import('@mirrorn/shared').Mirror['probe'];
}
export interface SoftwareDetail {
  id: string;
  name: string;
  ecosystemId: string;
  ecosystemLabel: string;
  kind: string;
  candidates: DownloadCandidate[];
}
export interface DownloadStart extends FilePage {
  filters: { platform: string; arch: string; version: string };
  options: { platforms: string[]; arches: string[]; roles: string[]; versionCount: number };
}
function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('目录响应格式不符');
  return raw as Record<string, unknown>;
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
function parsePage<T>(raw: unknown, valid: (value: unknown) => value is T): Page<T> {
  const value = record(raw);
  if (
    !Array.isArray(value.items) ||
    !value.items.every(valid) ||
    (value.nextCursor !== null && typeof value.nextCursor !== 'string') ||
    typeof value.total !== 'number'
  )
    throw new Error('目录分页格式不符');
  return value as unknown as Page<T>;
}
function isCatalogItem(raw: unknown): raw is CatalogItem {
  const value = record(raw);
  return (
    ['id', 'name', 'ecosystemId', 'ecosystemLabel', 'kind'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    ['software', 'ecosystem'].includes(String(value.type)) &&
    typeof value.softwareCount === 'number' &&
    typeof value.siteCount === 'number'
  );
}
export async function searchCatalog(
  query: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<Page<CatalogItem>> {
  const params = new URLSearchParams({ q: query });
  if (cursor) params.set('cursor', cursor);
  return parsePage(await request(`/api/catalog?${params}`, signal), isCatalogItem);
}
export async function loadEcosystemPage(
  id: string,
  query: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ q: query });
  if (cursor) params.set('cursor', cursor);
  const raw = record(
    await request(`/api/catalog/ecosystems/${encodeURIComponent(id)}?${params}`, signal),
  );
  const ecosystem = record(raw.ecosystem);
  if (typeof ecosystem.name !== 'string' || typeof ecosystem.softwareCount !== 'number')
    throw new Error('生态身份格式不符');
  return {
    ...parsePage(raw, isCatalogItem),
    ecosystem: { name: ecosystem.name, softwareCount: ecosystem.softwareCount },
  };
}
export async function loadSitePage(
  id: string,
  query: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<Page<SiteEntry>> {
  const params = new URLSearchParams({ q: query });
  if (cursor) params.set('cursor', cursor);
  return parsePage(
    await request(`/api/catalog/sites/${encodeURIComponent(id)}?${params}`, signal),
    (raw): raw is SiteEntry => {
      const value = record(raw);
      return (
        ['id', 'softwareId', 'name', 'ecosystemLabel', 'kind'].every(
          (key) => typeof value[key] === 'string',
        ) && typeof value.artifactCount === 'number'
      );
    },
  );
}
export async function loadNetworkFingerprint(signal?: AbortSignal): Promise<string | undefined> {
  const value = record(await request('/api/net-fingerprint', signal));
  return value.available === true && typeof value.fingerprint === 'string'
    ? value.fingerprint
    : undefined;
}
export async function loadSoftware(
  id: string,
  legacy = false,
  signal?: AbortSignal,
): Promise<SoftwareDetail> {
  const value = record(
    await request(
      `/api/catalog/${legacy ? 'resources' : 'software'}/${encodeURIComponent(id)}`,
      signal,
    ),
  );
  if (
    !['id', 'name', 'ecosystemId', 'ecosystemLabel', 'kind'].every(
      (key) => typeof value[key] === 'string',
    ) ||
    !Array.isArray(value.candidates)
  )
    throw new Error('软件身份格式不符');
  for (const raw of value.candidates) {
    const candidate = record(raw);
    if (
      !['id', 'siteId', 'siteName', 'downloadEntry'].every(
        (key) => typeof candidate[key] === 'string',
      ) ||
      !['CN', 'unknown'].includes(String(candidate.region)) ||
      typeof candidate.artifactCount !== 'number' ||
      new URL(String(candidate.downloadEntry)).protocol !== 'https:'
    )
      throw new Error('下载站点格式不符');
  }
  return value as unknown as SoftwareDetail;
}
export async function loadDownloadStart(
  candidate: DownloadCandidate,
  filters: FileFilters,
  signal?: AbortSignal,
): Promise<DownloadStart> {
  const value = record(
    await request(
      `/api/resources/${encodeURIComponent(candidate.id)}/start?${parameters(filters)}`,
      signal,
    ),
  );
  const items = parseArtifactList(value.items, new URL(candidate.downloadEntry).origin);
  const selected = record(value.filters);
  const options = record(value.options);
  if (
    !items ||
    (value.nextCursor !== null && typeof value.nextCursor !== 'string') ||
    !['platform', 'arch', 'version'].every((key) => typeof selected[key] === 'string') ||
    !['platforms', 'arches', 'roles'].every((key) => strings(options[key])) ||
    typeof options.versionCount !== 'number'
  )
    throw new Error('下载分页格式不符');
  return {
    items,
    nextCursor: value.nextCursor as string | null,
    filters: selected as DownloadStart['filters'],
    options: options as DownloadStart['options'],
  };
}
export async function loadVersions(
  candidate: DownloadCandidate,
  filters: FileFilters,
  search: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<Page<string>> {
  const params = parameters(filters);
  params.set('search', search);
  if (cursor) params.set('cursor', cursor);
  return parsePage(
    await request(`/api/resources/${encodeURIComponent(candidate.id)}/versions?${params}`, signal),
    (value): value is string => typeof value === 'string',
  );
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
