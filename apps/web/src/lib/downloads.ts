export type ArtifactPlatform =
  'windows' | 'macos' | 'linux' | 'android' | 'freebsd' | 'any' | 'unknown';

export interface Artifact {
  version: string;
  platform: ArtifactPlatform;
  arch: string;
  format: string;
  filename: string;
  url: string;
  size?: number;
  sizeEstimated?: boolean;
  mtime?: string;
  platforms?: ArtifactPlatform[];
  role?: string;
  compatibility?: Record<string, string | boolean>;
}

export interface ResourceSummary {
  id: string;
  siteId: string;
  siteName: string;
  repoId: string;
  name: string;
  softwareId?: string;
  ecosystemId: string;
  ecosystemLabel: string;
  ecosystemCategory: string;
  kind: string;
  downloadEntry: string;
  versionsHint: string;
  platforms: string[];
  helpDocUrl: string | null;
  tutorialId: string | null;
  artifactCount: number;
  latestVersion: string | null;
  downloadMode: 'files' | 'unavailable';
}

export interface ResourceDetail {
  resource: ResourceSummary;
  artifacts: Artifact[];
  crawledAt?: number;
  crawl?: {
    result: 'complete' | 'partial' | 'failed' | 'skipped' | 'unknown';
    checkedAt: number;
    requests: number;
  } | null;
}

export interface EcosystemSummary {
  id: string;
  label: string;
  category: string;
  resourceCount: number;
  siteCount: number;
  tutorialCount: number;
  downloadableResourceCount?: number;
  repositoryCount?: number;
}

export const PLATFORM_LABELS: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  freebsd: 'FreeBSD',
  any: '通用',
  unknown: '其它',
};

export const KIND_LABELS: Record<string, string> = {
  installer: '安装包',
  iso: '安装镜像',
  files: '可下载文件',
  dataset: '数据集',
  'distro-repo': '发行版软件源',
  'language-repo': '语言包仓库',
};

/** 教程页面上的平台顺序：跟新手最可能用的系统对上，而不是字典序。 */
const PLATFORM_ORDER = ['windows', 'macos', 'linux', 'android', 'freebsd', 'any', 'unknown'];

export function detectPlatform(
  userAgent: string,
  platform = '',
): { os?: ArtifactPlatform; arch?: string } {
  const value = `${platform} ${userAgent}`;
  const os: ArtifactPlatform | undefined = /windows/i.test(value)
    ? 'windows'
    : /macintosh|mac os|macintel/i.test(value)
      ? 'macos'
      : /android/i.test(value)
        ? 'android'
        : /linux|x11/i.test(value)
          ? 'linux'
          : undefined;
  // Apple Silicon 上的 Safari 常常把自己报成 Intel，因此 macOS 不推断架构。
  const arch = /aarch64|arm64|apple silicon/i.test(value)
    ? 'arm64'
    : os !== 'macos' && /x86_64|win64|x64|amd64/i.test(value)
      ? 'x64'
      : undefined;
  return { os, arch };
}

export function compareVersions(a: string, b: string): number {
  const numbers = (value: string): number[] =>
    [...value.matchAll(/\d+/g)].map((match) => Number(match[0]));
  const left = numbers(a);
  const right = numbers(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function platformsOf(artifacts: Artifact[]): ArtifactPlatform[] {
  const present = new Set(
    artifacts.flatMap((artifact) =>
      artifact.platforms?.length ? artifact.platforms : [artifact.platform],
    ),
  );
  const ordered = PLATFORM_ORDER.filter((platform) => present.has(platform as ArtifactPlatform));
  for (const platform of present) {
    if (!ordered.includes(platform)) ordered.push(platform);
  }
  return ordered as ArtifactPlatform[];
}

export function versionsFor(artifacts: Artifact[], platform: string, arch = ''): string[] {
  return [
    ...new Set(
      artifacts
        .filter(
          (artifact) =>
            (platform === '' ||
              artifact.platform === platform ||
              artifact.platforms?.includes(platform as ArtifactPlatform) ||
              artifact.platform === 'any' ||
              artifact.platform === 'unknown') &&
            (arch === '' || artifact.arch === arch || artifact.arch === 'unknown'),
        )
        .map((artifact) => artifact.version),
    ),
  ].sort((a, b) => compareVersions(b, a));
}

/** 通用文件对所有系统可见；不明平台也不应因为浏览器检测结果被藏起来。 */
export function artifactsFor(artifacts: Artifact[], version: string, platform: string): Artifact[] {
  return artifacts
    .filter(
      (artifact) =>
        artifact.version === version &&
        (platform === '' ||
          artifact.platform === platform ||
          artifact.platforms?.includes(platform as ArtifactPlatform) ||
          artifact.platform === 'any' ||
          artifact.platform === 'unknown'),
    )
    .sort((a, b) => a.arch.localeCompare(b.arch) || a.format.localeCompare(b.format));
}

export function humanSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** 教程正文里的占位符：照着用户选中的文件替换，教程才能对上他下载的那一个。 */
export function fillTutorial(
  body: string,
  values: {
    filename?: string;
    version?: string;
    platform?: string;
    arch?: string;
    site?: string;
    product?: string;
  },
): string {
  const map: Record<string, string> = {
    filename: values.filename ?? '（还没选文件）',
    version: values.version ?? '（还没选版本）',
    platform:
      values.platform === undefined ? '' : (PLATFORM_LABELS[values.platform] ?? values.platform),
    arch: values.arch ?? '',
    site: values.site ?? '',
    product: values.product ?? '',
  };
  return body.replace(
    /{{\s*(filename|version|platform|arch|site|product)\s*}}/g,
    (_, key: string) => map[key] ?? '',
  );
}

function isArtifact(value: unknown, origin: string): value is Artifact {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.version !== 'string') return false;
  if (typeof item.platform !== 'string' || typeof item.arch !== 'string') return false;
  if (typeof item.format !== 'string' || typeof item.filename !== 'string') return false;
  if (typeof item.url !== 'string') return false;
  try {
    if (new URL(item.url).origin !== origin) return false;
  } catch {
    return false;
  }
  if (item.size !== undefined && typeof item.size !== 'number') return false;
  if (item.sizeEstimated !== undefined && typeof item.sizeEstimated !== 'boolean') return false;
  if (item.mtime !== undefined && typeof item.mtime !== 'string') return false;
  if (
    item.platforms !== undefined &&
    (!Array.isArray(item.platforms) ||
      item.platforms.some((platform) => !['windows', 'macos', 'linux'].includes(String(platform))))
  )
    return false;
  if (
    item.compatibility !== undefined &&
    (typeof item.compatibility !== 'object' ||
      item.compatibility === null ||
      Array.isArray(item.compatibility) ||
      Object.values(item.compatibility).some(
        (value) => !['string', 'boolean'].includes(typeof value),
      ))
  )
    return false;
  return true;
}

function isResource(value: unknown): value is ResourceSummary {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.siteId === 'string' &&
    typeof item.siteName === 'string' &&
    typeof item.name === 'string' &&
    typeof item.ecosystemId === 'string' &&
    typeof item.ecosystemLabel === 'string' &&
    typeof item.kind === 'string' &&
    typeof item.downloadEntry === 'string' &&
    typeof item.versionsHint === 'string' &&
    Array.isArray(item.platforms) &&
    (item.helpDocUrl === null || typeof item.helpDocUrl === 'string') &&
    (item.tutorialId === null || typeof item.tutorialId === 'string') &&
    ['files', 'unavailable'].includes(String(item.downloadMode))
  );
}

/**
 * 客户端只接受两种地址：站点自己的下载入口，以及镜像站域名下的文件直链。
 * 后端被改坏或上游注入时，页面宁可少一个文件，也不把用户送到别的域名。
 */
export function parseResourceDetail(value: unknown): ResourceDetail | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const payload = value as Record<string, unknown>;
  if (!isResource(payload.resource) || !Array.isArray(payload.artifacts)) return undefined;
  let origin: string;
  try {
    origin = new URL(payload.resource.downloadEntry).origin;
  } catch {
    return undefined;
  }
  const artifacts = payload.artifacts.filter((item): item is Artifact => isArtifact(item, origin));
  return {
    resource: payload.resource,
    artifacts,
    ...(typeof payload.crawledAt === 'number' ? { crawledAt: payload.crawledAt } : {}),
    ...(payload.crawl && typeof payload.crawl === 'object'
      ? { crawl: payload.crawl as ResourceDetail['crawl'] }
      : {}),
  };
}

export function parseResourceList(value: unknown): ResourceSummary[] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.items)) return undefined;
  return payload.items.filter(isResource);
}

export function parseEcosystemList(value: unknown): EcosystemSummary[] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.items)) return undefined;
  return payload.items.filter((item): item is EcosystemSummary => {
    if (typeof item !== 'object' || item === null) return false;
    const entry = item as Record<string, unknown>;
    return (
      typeof entry.id === 'string' &&
      typeof entry.label === 'string' &&
      typeof entry.category === 'string' &&
      typeof entry.resourceCount === 'number'
    );
  });
}

export function parseArtifactList(value: unknown, origin: string): Artifact[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is Artifact => isArtifact(item, origin));
}
