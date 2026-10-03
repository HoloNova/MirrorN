import type { DatabaseSync } from 'node:sqlite';
import type { Mirror, SiteResourceList, Tutorial } from '@mirrorn/shared';
import { registerSoftware, syncSites } from './installers.js';
import { loadDownloadRules, type RuleSet } from '../indexing/rules/load.js';
import { compareRepoVersions } from '../indexing/versions.js';

export interface ResourceRow {
  id: string;
  siteId: string;
  siteName: string;
  repoId: string;
  name: string;
  softwareId: string;
  ecosystemId: string;
  ecosystemLabel: string;
  ecosystemCategory: string;
  kind: string;
  downloadEntry: string;
  versionsHint: string;
  crawlDepth: number | null;
  platforms: string[];
  helpDocUrl: string | null;
  tutorialId: string | null;
  artifactCount: number;
  latestVersion: string | null;
  downloadMode: 'files' | 'unavailable';
}

/** 配置只同步身份，绝不导入旧包清单。软件下载元数据由后台填充。 */
export function syncCatalog(
  db: DatabaseSync,
  input: {
    mirrors: Mirror[];
    taxonomy: Array<{ id: string; label: string; category: string; aliases: string[] }>;
    siteResources: SiteResourceList[];
    tutorials: Tutorial[];
    now?: number;
    rules?: RuleSet | null;
  },
) {
  syncSites(db, input.mirrors);
  const tutorials = new Set(input.tutorials.map((item) => item.id));
  const rules = input.rules === undefined ? loadDownloadRules() : input.rules;
  db.exec('BEGIN IMMEDIATE');
  try {
    const eco = db.prepare(
      `INSERT INTO catalog_ecosystems(slug,label,category,aliases) VALUES(?,?,?,?) ON CONFLICT(slug) DO UPDATE SET label=excluded.label,category=excluded.category,aliases=excluded.aliases`,
    );
    for (const row of input.taxonomy)
      eco.run(row.id, row.label, row.category, JSON.stringify(row.aliases));
    const source = db.prepare(
      `INSERT INTO catalog_sources(site_id,repo,ecosystem_id,name,payload) SELECT s.id,?,e.id,?,? FROM catalog_sites s CROSS JOIN catalog_ecosystems e WHERE s.slug='pku' AND e.slug=? ON CONFLICT(site_id,repo) DO UPDATE SET ecosystem_id=excluded.ecosystem_id,name=excluded.name,payload=excluded.payload`,
    );
    for (const list of input.siteResources)
      if (list.siteId === 'pku')
        for (const row of list.resources)
          source.run(row.id, row.name, JSON.stringify(row), row.ecosystemId);
    db.prepare(
      `UPDATE catalog_software SET ecosystem_id=(SELECT ecosystem_id FROM catalog_sources WHERE repo=catalog_software.repo LIMIT 1) WHERE ecosystem_id IS NULL`,
    ).run();
    for (const software of rules?.identities ?? []) {
      const category = input.taxonomy.find((e) => e.id === software.ecosystemId)?.category;
      if (!category) throw new Error(`软件生态未登记：${software.slug}`);
      registerSoftware(db, {
        ...software,
        category,
        kind: [...rules!.rules.values()]
          .filter((rule) => rule.softwareIds.includes(software.slug))
          .every((rule) => rule.matches.every((match) => match.purpose === 'system_image'))
          ? 'iso'
          : 'installer',
        ...(software.tutorialId && !tutorials.has(software.tutorialId)
          ? { tutorialId: undefined }
          : {}),
      });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return {
    sites: input.mirrors.length,
    resources: rules?.identities.length ?? 0,
    ecosystems: listEcosystems(db).length,
  };
}

interface Raw {
  site_id: number;
  site_slug: string;
  site_name: string;
  software_id: number;
  slug: string;
  resource_key: string;
  name: string;
  category: string;
  kind: string;
  repo: string;
  tutorial_id: string | null;
  count: number;
  ecosystem_slug: string;
  ecosystem_label: string;
  ecosystem_category: string;
  platforms: string | null;
  entry: string | null;
}
const SELECT = `SELECT s.id site_id,s.slug site_slug,s.name site_name,w.id software_id,w.slug,w.resource_key,
  w.name,w.category,w.kind,w.repo,w.tutorial_id,e.slug ecosystem_slug,e.label ecosystem_label,e.category ecosystem_category,COUNT(d.id) count,GROUP_CONCAT(DISTINCT d.platform) platforms,
  (SELECT directory FROM catalog_scopes c WHERE c.site_id=s.id AND c.software_id=w.id AND c.enabled=1 ORDER BY length(directory) LIMIT 1) entry
  FROM catalog_sites s JOIN catalog_software_sites ws ON ws.site_id=s.id JOIN catalog_software w ON w.id=ws.software_id
  JOIN catalog_ecosystems e ON e.id=w.ecosystem_id
  LEFT JOIN catalog_versions v ON v.software_id=w.id
  LEFT JOIN catalog_downloads d ON d.version_id=v.id AND d.site_id=s.id`;

function toResource(db: DatabaseSync, raw: Raw): ResourceRow {
  const versions = db
    .prepare(
      `SELECT DISTINCT v.version FROM catalog_versions v JOIN catalog_downloads d ON d.version_id=v.id
    WHERE v.software_id=? AND d.site_id=?`,
    )
    .all(raw.software_id, raw.site_id) as { version: string }[];
  versions.sort(
    (a, b) =>
      Number(/^(latest|current|release)$/i.test(a.version)) -
        Number(/^(latest|current|release)$/i.test(b.version)) ||
      compareRepoVersions(raw.repo, b.version, a.version),
  );
  const downloads = db
    .prepare(
      'SELECT d.platform,d.metadata FROM catalog_downloads d JOIN catalog_versions v ON v.id=d.version_id WHERE v.software_id=? AND d.site_id=?',
    )
    .all(raw.software_id, raw.site_id) as { platform: string; metadata: string }[];
  const platforms = [
    ...new Set(
      downloads.flatMap((d) => {
        const metadata = JSON.parse(d.metadata) as { platforms?: string[] };
        return metadata.platforms?.length ? metadata.platforms : [d.platform];
      }),
    ),
  ];
  return {
    id: `${raw.site_slug}:${raw.resource_key}`,
    siteId: raw.site_slug,
    siteName: raw.site_name,
    repoId: raw.repo,
    name: raw.name,
    softwareId: raw.slug,
    ecosystemId: raw.ecosystem_slug,
    ecosystemLabel: raw.ecosystem_label,
    ecosystemCategory: raw.ecosystem_category,
    kind: raw.kind,
    downloadEntry: raw.entry ?? `https://mirrors.pku.edu.cn/${raw.repo}/`,
    versionsHint: '',
    crawlDepth: null,
    platforms: platforms.includes('any')
      ? [...new Set([...platforms.filter((p) => p !== 'any'), 'windows', 'macos', 'linux'])]
      : platforms,
    helpDocUrl: null,
    tutorialId: raw.tutorial_id,
    artifactCount: raw.count,
    latestVersion: versions[0]?.version ?? null,
    downloadMode: raw.count ? 'files' : 'unavailable',
  };
}
export interface SearchOptions {
  query?: string;
  version?: string;
  ecosystemId?: string;
  siteId?: string;
  kind?: string;
  onlyTutorials?: boolean;
  downloadableOnly?: boolean;
  limit?: number;
}

/** 生态搜索只查软件名字/别名及版本关系，不扫描全体文件名。 */
export function searchResources(db: DatabaseSync, options: SearchOptions = {}): ResourceRow[] {
  const where = ["s.slug='pku'"];
  const params: (string | number)[] = [];
  if (options.ecosystemId) {
    where.push('e.slug=?');
    params.push(options.ecosystemId);
  }
  if (options.siteId) {
    where.push('s.slug=?');
    params.push(options.siteId);
  }
  if (options.kind) {
    where.push('w.kind=?');
    params.push(options.kind);
  }
  if (options.onlyTutorials) where.push('w.tutorial_id IS NOT NULL');
  const escape = (value: string) => value.replace(/[\\%_]/g, '\\$&');
  const versionMatch = (value: string) => {
    where.push(`EXISTS(SELECT 1 FROM catalog_versions vv JOIN catalog_downloads dd ON dd.version_id=vv.id
      WHERE vv.software_id=w.id AND dd.site_id=s.id AND ltrim(vv.version,'v') LIKE ? ESCAPE '\\')`);
    params.push(`${escape(value.replace(/^v/, ''))}%`);
  };
  if (options.version) versionMatch(options.version);
  for (const term of options.query?.trim().slice(0, 200).split(/\s+/).filter(Boolean) ?? []) {
    if (/^v?\d+(?:[.\d-]*\w*)?$/.test(term)) {
      versionMatch(term);
      continue;
    }
    const needle = term.length < 3 ? escape(term) : `%${escape(term)}%`;
    where.push(`(lower(w.name) LIKE lower(?) ESCAPE '\\' OR lower(w.slug) LIKE lower(?) ESCAPE '\\'
      OR EXISTS(SELECT 1 FROM json_each(w.aliases) a WHERE lower(a.value) LIKE lower(?) ESCAPE '\\')
      OR lower(e.label) LIKE lower(?) ESCAPE '\\' OR lower(e.slug)=lower(?)
      OR EXISTS(SELECT 1 FROM json_each(e.aliases) a WHERE lower(a.value) LIKE lower(?) ESCAPE '\\') OR lower(s.name) LIKE lower(?) ESCAPE '\\')`);
    params.push(needle, needle, needle, needle, term, needle, needle);
  }
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  // 已收录与可下载是独立状态，调用方可明确要求downloadableOnly。
  const rows = db
    .prepare(
      `${SELECT} WHERE ${where.join(' AND ')} GROUP BY s.id,w.id ${options.downloadableOnly ? 'HAVING COUNT(d.id)>0' : ''}
    ORDER BY w.category,w.name LIMIT ?`,
    )
    .all(...params, limit) as unknown as Raw[];
  return rows.map((row) => toResource(db, row));
}
export function getResource(db: DatabaseSync, id: string): ResourceRow | undefined {
  const [site, ...parts] = id.split(':');
  if (site !== 'pku') return undefined;
  const raw = db
    .prepare(`${SELECT} WHERE s.slug=? AND w.resource_key=? GROUP BY s.id,w.id`)
    .get(site, parts.join(':')) as Raw | undefined;
  return raw ? toResource(db, raw) : undefined;
}
export interface EcosystemSummary {
  id: string;
  label: string;
  category: string;
  resourceCount: number;
  siteCount: number;
  tutorialCount: number;
}
export function listEcosystems(db: DatabaseSync): EcosystemSummary[] {
  return db
    .prepare(
      `SELECT e.slug id,e.label,e.category,COUNT(DISTINCT ws.software_id) resourceCount,COUNT(DISTINCT s.id) siteCount,
      COUNT(DISTINCT CASE WHEN w.tutorial_id IS NOT NULL AND ws.software_id IS NOT NULL THEN w.id END) tutorialCount,
      COUNT(DISTINCT CASE WHEN d.id IS NOT NULL AND ws.software_id IS NOT NULL THEN w.id END) downloadableResourceCount,COUNT(DISTINCT r.repo) repositoryCount
      FROM catalog_ecosystems e JOIN catalog_sources r ON r.ecosystem_id=e.id JOIN catalog_sites s ON s.id=r.site_id
      LEFT JOIN catalog_software w ON w.ecosystem_id=e.id LEFT JOIN catalog_software_sites ws ON ws.software_id=w.id AND ws.site_id=s.id
      LEFT JOIN catalog_versions v ON v.software_id=w.id LEFT JOIN catalog_downloads d ON d.version_id=v.id AND d.site_id=s.id
      WHERE s.slug='pku' GROUP BY e.id ORDER BY e.category,e.label`,
    )
    .all() as unknown as EcosystemSummary[];
}
export function lastCrawlAt(db: DatabaseSync, resourceId: string): number | undefined {
  const resource = getResource(db, resourceId);
  if (!resource) return undefined;
  const row = db
    .prepare(
      `SELECT MAX(d.crawled_at) at FROM catalog_downloads d JOIN catalog_versions v ON v.id=d.version_id
    JOIN catalog_software w ON w.id=v.software_id JOIN catalog_sites s ON s.id=d.site_id WHERE s.slug=? AND w.resource_key=?`,
    )
    .get(resource.siteId, resource.id.split(':').slice(1).join(':')) as { at: number | null };
  return row.at ?? undefined;
}
export function latestCrawl(
  db: DatabaseSync,
  resourceId: string,
): { result: 'complete' | 'failed'; checkedAt: number; requests: number } | undefined {
  const resource = getResource(db, resourceId);
  if (!resource) return undefined;
  const row = db
    .prepare(
      `SELECT r.state result,r.finished_at checkedAt,r.requests FROM catalog_runs r
    JOIN catalog_scopes c ON c.id=r.scope_id JOIN catalog_software w ON w.id=c.software_id JOIN catalog_sites s ON s.id=c.site_id
    WHERE s.slug=? AND w.resource_key=? AND r.state<>'staging' ORDER BY r.id DESC LIMIT 1`,
    )
    .get(resource.siteId, resource.id.split(':').slice(1).join(':')) as
    { result: 'complete' | 'failed'; checkedAt: number; requests: number } | undefined;
  return row;
}
export function listSites(db: DatabaseSync) {
  const rows = db
    .prepare(
      `SELECT s.slug,s.name,s.payload,(SELECT COUNT(*) FROM catalog_software_sites ws WHERE ws.site_id=s.id AND s.slug='pku') count
    FROM catalog_sites s ORDER BY s.name`,
    )
    .all() as { slug: string; name: string; payload: string; count: number }[];
  return rows.map((row) => {
    const mirror = JSON.parse(row.payload) as Mirror;
    return {
      id: row.slug,
      name: row.name,
      kind: mirror.kind,
      homepageUrl: mirror.homepageUrl,
      aliases: mirror.aliases,
      ...(mirror.probe ? { probe: mirror.probe } : {}),
      enabled: row.slug === 'pku',
      resourceCount: row.count,
    };
  });
}
