import type { DatabaseSync } from 'node:sqlite';

import type { Mirror, SiteResourceList, Tutorial } from '@mirrorn/shared';
import { ENABLED_RESOURCE_SITE } from '../indexing/policy.js';

export interface ResourceRow {
  id: string;
  siteId: string;
  siteName: string;
  repoId: string;
  name: string;
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

const RESOURCE_ID = (siteId: string, repoId: string): string => `${siteId}:${repoId}`;

/**
 * 配置只定义身份与采集归类；实际文件完全由后台动态采集产生。
 * 启动时只upsert，不把配置缺项解释成源站删除，也不触碰有效文件。
 */
export function syncCatalog(
  db: DatabaseSync,
  input: {
    mirrors: Mirror[];
    taxonomy: Array<{ id: string; label: string; category: string; aliases: string[] }>;
    siteResources: SiteResourceList[];
    tutorials: Tutorial[];
    now?: number;
  },
): { sites: number; resources: number; ecosystems: number } {
  const now = input.now ?? Date.now();
  const tutorialIds = new Set(input.tutorials.map((tutorial) => tutorial.id));

  const upsertSite = db.prepare(
    `INSERT INTO sites (id, name, kind, homepage_url, aliases, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind,
       homepage_url = excluded.homepage_url, aliases = excluded.aliases, updated_at = excluded.updated_at`,
  );
  const upsertEcosystem = db.prepare(
    `INSERT INTO ecosystems (id, label, category, aliases, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET label = excluded.label, category = excluded.category,
       aliases = excluded.aliases, updated_at = excluded.updated_at`,
  );
  const upsertResource = db.prepare(
    `INSERT INTO resources (id, site_id, repo_id, name, ecosystem_id, kind, download_entry,
       versions_hint, crawl_depth, platforms, help_doc_url, tutorial_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET site_id = excluded.site_id, repo_id = excluded.repo_id,
       name = excluded.name, ecosystem_id = excluded.ecosystem_id, kind = excluded.kind,
       download_entry = excluded.download_entry, versions_hint = excluded.versions_hint,
       crawl_depth = excluded.crawl_depth,
       platforms = excluded.platforms, help_doc_url = excluded.help_doc_url,
       tutorial_id = excluded.tutorial_id, updated_at = excluded.updated_at`,
  );

  let resources = 0;
  db.exec('BEGIN');
  try {
    for (const mirror of input.mirrors) {
      upsertSite.run(
        mirror.id,
        mirror.name,
        mirror.kind,
        mirror.homepageUrl,
        JSON.stringify(mirror.aliases),
        now,
      );
      db.prepare(
        'INSERT INTO site_details(site_id,payload) VALUES(?,?) ON CONFLICT(site_id) DO UPDATE SET payload=excluded.payload',
      ).run(mirror.id, JSON.stringify(mirror));
    }
    for (const entry of input.taxonomy) {
      upsertEcosystem.run(
        entry.id,
        entry.label,
        entry.category,
        JSON.stringify(entry.aliases),
        now,
      );
    }

    for (const list of input.siteResources) {
      for (const resource of list.resources) {
        const id = RESOURCE_ID(list.siteId, resource.id);
        upsertResource.run(
          id,
          list.siteId,
          resource.id,
          resource.name,
          resource.ecosystemId,
          resource.kind,
          resource.downloadEntry,
          resource.versionsHint,
          resource.crawlDepth ?? null,
          JSON.stringify(resource.platforms),
          resource.helpDocUrl,
          resource.tutorialId !== null && tutorialIds.has(resource.tutorialId)
            ? resource.tutorialId
            : null,
          now,
        );
        resources += 1;
      }
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { sites: input.mirrors.length, resources, ecosystems: input.taxonomy.length };
}

interface RawResourceRow {
  id: string;
  site_id: string;
  site_name: string;
  repo_id: string;
  name: string;
  ecosystem_id: string;
  ecosystem_label: string;
  ecosystem_category: string;
  kind: string;
  download_entry: string;
  versions_hint: string;
  crawl_depth: number | null;
  platforms: string;
  help_doc_url: string | null;
  tutorial_id: string | null;
  artifact_count: number;
  latest_version: string | null;
  download_mode: ResourceRow['downloadMode'];
}

function toResourceRow(raw: RawResourceRow): ResourceRow {
  return {
    id: raw.id,
    siteId: raw.site_id,
    siteName: raw.site_name,
    repoId: raw.repo_id,
    name: raw.name,
    ecosystemId: raw.ecosystem_id,
    ecosystemLabel: raw.ecosystem_label,
    ecosystemCategory: raw.ecosystem_category,
    kind: raw.kind,
    downloadEntry: raw.download_entry,
    versionsHint: raw.versions_hint,
    crawlDepth: raw.crawl_depth,
    platforms: JSON.parse(raw.platforms) as string[],
    helpDocUrl: raw.help_doc_url,
    tutorialId: raw.tutorial_id,
    artifactCount: raw.artifact_count,
    latestVersion: raw.latest_version,
    downloadMode: raw.download_mode,
  };
}

// 下载资格仅由数据库有效文件决定，不再提供按需抓取。
const DOWNLOAD_MODE = `CASE WHEN r.site_id = '${ENABLED_RESOURCE_SITE}' AND EXISTS
  (SELECT 1 FROM effective_files a WHERE a.resource_id = r.id) THEN 'files' ELSE 'unavailable' END`;
const READY = `${DOWNLOAD_MODE} <> 'unavailable'`;

const RESOURCE_SELECT = `
  SELECT r.id, r.site_id, s.name AS site_name, r.repo_id, r.name, r.ecosystem_id,
         e.label AS ecosystem_label, e.category AS ecosystem_category, r.kind,
         r.download_entry, r.versions_hint, r.crawl_depth, r.platforms, r.help_doc_url, r.tutorial_id,
         (SELECT COUNT(DISTINCT a.url) FROM effective_files a WHERE a.resource_id = r.id) AS artifact_count,
          NULL AS latest_version,
          ${DOWNLOAD_MODE} AS download_mode
  FROM resources r
  JOIN sites s ON s.id = r.site_id
  JOIN ecosystems e ON e.id = r.ecosystem_id`;

export interface SearchOptions {
  query?: string;
  ecosystemId?: string;
  siteId?: string;
  kind?: string;
  onlyTutorials?: boolean;
  downloadableOnly?: boolean;
  limit?: number;
}

/** 搜索与筛选走同一张表，因此“搜到的”和“筛出来的”永远是同一批资源。 */
export function searchResources(db: DatabaseSync, options: SearchOptions = {}): ResourceRow[] {
  const clauses: string[] = [`r.site_id = '${ENABLED_RESOURCE_SITE}'`];
  const params: Array<string | number> = [];

  const query = options.query?.trim();
  if (query !== undefined && query !== '') {
    const like = `%${query}%`;
    clauses.push(
      `(r.name LIKE ? OR r.repo_id LIKE ? OR r.versions_hint LIKE ? OR e.label LIKE ? OR e.aliases LIKE ? OR s.name LIKE ? OR s.aliases LIKE ?)`,
    );
    params.push(like, like, like, like, like, like, like);
  }
  if (options.ecosystemId !== undefined) {
    clauses.push('r.ecosystem_id = ?');
    params.push(options.ecosystemId);
  }
  if (options.siteId !== undefined) {
    clauses.push('r.site_id = ?');
    params.push(options.siteId);
  }
  if (options.kind !== undefined) {
    clauses.push('r.kind = ?');
    params.push(options.kind);
  }
  if (options.onlyTutorials === true) {
    clauses.push('r.tutorial_id IS NOT NULL');
  }
  if (options.downloadableOnly === true) {
    clauses.push(READY);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  // 有实际文件的排在前面；教程只作为内容附加，不影响下载资格。
  const rows = db
    .prepare(
      `${RESOURCE_SELECT}${where} ORDER BY (download_mode <> 'files'), e.category, e.label, r.name LIMIT ?`,
    )
    .all(...params, limit) as unknown as RawResourceRow[];
  return rows.map(toResourceRow);
}

export function getResource(db: DatabaseSync, id: string): ResourceRow | undefined {
  const row = db
    .prepare(`${RESOURCE_SELECT} WHERE r.id = ? AND r.site_id = '${ENABLED_RESOURCE_SITE}'`)
    .get(id) as unknown as RawResourceRow | undefined;
  return row === undefined ? undefined : toResourceRow(row);
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
  const rows = db
    .prepare(
      `SELECT e.id, e.label, e.category,
               COUNT(r.id) AS resource_count,
               COUNT(DISTINCT r.site_id) AS site_count,
               COUNT(DISTINCT r.tutorial_id) AS tutorial_count
       FROM ecosystems e
        LEFT JOIN resources r ON r.ecosystem_id = e.id AND r.site_id = '${ENABLED_RESOURCE_SITE}' AND ${READY}
        GROUP BY e.id
        HAVING COUNT(r.id) > 0
       ORDER BY e.category, e.label`,
    )
    .all() as unknown as Array<{
    id: string;
    label: string;
    category: string;
    resource_count: number;
    site_count: number;
    tutorial_count: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    category: row.category,
    resourceCount: row.resource_count,
    siteCount: row.site_count,
    tutorialCount: row.tutorial_count,
  }));
}

/** 上次抓取时间：页面据此说明“文件清单是什么时候抓的”。 */
export function lastCrawlAt(db: DatabaseSync, resourceId: string): number | undefined {
  const row = db
    .prepare('SELECT MAX(crawled_at) AS at FROM effective_files WHERE resource_id = ?')
    .get(resourceId) as unknown as { at: number | null } | undefined;
  return row?.at ?? undefined;
}

export function latestCrawl(
  db: DatabaseSync,
  resourceId: string,
):
  | {
      result: 'complete' | 'partial' | 'failed' | 'skipped' | 'unknown';
      checkedAt: number;
      requests: number;
    }
  | undefined {
  const row = db
    .prepare(
      `SELECT result, finished_at, requests FROM crawl_runs
    WHERE resource_id = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`,
    )
    .get(resourceId) as unknown as
    | {
        result: 'complete' | 'partial' | 'failed' | 'skipped' | 'unknown';
        finished_at: number;
        requests: number;
      }
    | undefined;
  return row && { result: row.result, checkedAt: row.finished_at, requests: row.requests };
}

export function listSites(db: DatabaseSync) {
  const rows = db
    .prepare(
      `SELECT s.id,s.name,s.kind,s.homepage_url,s.aliases,d.payload,
    (SELECT COUNT(*) FROM resources r WHERE r.site_id=s.id AND r.site_id='pku') AS resource_count
    FROM sites s LEFT JOIN site_details d ON d.site_id=s.id ORDER BY s.name`,
    )
    .all() as {
    id: string;
    name: string;
    kind: Mirror['kind'];
    homepage_url: string;
    aliases: string;
    payload: string | null;
    resource_count: number;
  }[];
  return rows.map((row) => {
    const metadata = row.payload ? (JSON.parse(row.payload) as Mirror) : undefined;
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      homepageUrl: row.homepage_url,
      aliases: JSON.parse(row.aliases) as string[],
      ...(metadata?.probe ? { probe: metadata.probe } : {}),
      enabled: row.id === 'pku',
      resourceCount: row.resource_count,
    };
  });
}
