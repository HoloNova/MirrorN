import type { DatabaseSync } from 'node:sqlite';
import type { Mirror } from '@mirrorn/shared';
import { sourceUrl } from '../indexing/policy.js';

/** 四类业务实体。批次只用于短暂暂存，不复制有效下载记录。 */
export function installCatalog(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog_sites (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_software (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, resource_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, aliases TEXT NOT NULL, category TEXT NOT NULL,
      repo TEXT NOT NULL, tutorial_id TEXT
    );
    CREATE TABLE IF NOT EXISTS catalog_versions (
      id INTEGER PRIMARY KEY, software_id INTEGER NOT NULL REFERENCES catalog_software(id),
      version TEXT NOT NULL, UNIQUE(software_id,version)
    );
    CREATE TABLE IF NOT EXISTS catalog_scopes (
      id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL REFERENCES catalog_sites(id),
      software_id INTEGER NOT NULL REFERENCES catalog_software(id), directory TEXT NOT NULL,
      epoch INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0, checked_at INTEGER,
      parent_id INTEGER REFERENCES catalog_scopes(id), enabled INTEGER NOT NULL DEFAULT 1,
      discovered_epoch INTEGER NOT NULL DEFAULT 0,
      UNIQUE(site_id,software_id,directory)
    );
    CREATE INDEX IF NOT EXISTS scope_parent ON catalog_scopes(parent_id);
    CREATE TABLE IF NOT EXISTS catalog_downloads (
      id INTEGER PRIMARY KEY, version_id INTEGER NOT NULL REFERENCES catalog_versions(id),
      site_id INTEGER NOT NULL REFERENCES catalog_sites(id), scope_id INTEGER NOT NULL REFERENCES catalog_scopes(id),
      filename TEXT NOT NULL, url TEXT NOT NULL UNIQUE, platform TEXT NOT NULL,
      arch TEXT NOT NULL, format TEXT NOT NULL, size INTEGER, checksum TEXT,
      seen_run INTEGER NOT NULL, crawled_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS download_version_site ON catalog_downloads(version_id,site_id,id);
    CREATE INDEX IF NOT EXISTS download_site_version ON catalog_downloads(site_id,version_id);
    CREATE INDEX IF NOT EXISTS download_scope ON catalog_downloads(scope_id);
    CREATE TABLE IF NOT EXISTS catalog_runs (
      id INTEGER PRIMARY KEY, scope_id INTEGER NOT NULL REFERENCES catalog_scopes(id),
      epoch INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('staging','complete','failed')),
      started_at INTEGER NOT NULL, finished_at INTEGER, error TEXT,
      requests INTEGER NOT NULL DEFAULT 0, network_bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS catalog_staged (
      run_id INTEGER NOT NULL REFERENCES catalog_runs(id) ON DELETE CASCADE,
      version TEXT NOT NULL, filename TEXT NOT NULL, url TEXT NOT NULL,
      platform TEXT NOT NULL, arch TEXT NOT NULL, format TEXT NOT NULL,
      size INTEGER, checksum TEXT, PRIMARY KEY(run_id,url)
    );
  `);
  const add = (table: string, column: string, declaration: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((row) => row.name === column))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  };
  db.exec(`CREATE TABLE IF NOT EXISTS catalog_ecosystems (
    id INTEGER PRIMARY KEY,slug TEXT NOT NULL UNIQUE,label TEXT NOT NULL,category TEXT NOT NULL,aliases TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS catalog_sources (
    site_id INTEGER NOT NULL REFERENCES catalog_sites(id),repo TEXT NOT NULL,ecosystem_id INTEGER NOT NULL REFERENCES catalog_ecosystems(id),
    name TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(site_id,repo)
  );
  CREATE TABLE IF NOT EXISTS catalog_software_sites (
    site_id INTEGER NOT NULL REFERENCES catalog_sites(id),software_id INTEGER NOT NULL REFERENCES catalog_software(id),PRIMARY KEY(site_id,software_id)
  );
  CREATE TABLE IF NOT EXISTS catalog_pending (
    binding_id TEXT NOT NULL,reason TEXT NOT NULL,signature TEXT NOT NULL,samples TEXT NOT NULL,
    observations INTEGER NOT NULL,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL,rule_revision TEXT NOT NULL,
    PRIMARY KEY(binding_id,reason,signature)
  );`);
  add('catalog_software', 'ecosystem_id', 'INTEGER REFERENCES catalog_ecosystems(id)');
  add('catalog_software', 'kind', "TEXT NOT NULL DEFAULT 'installer'");
  add('catalog_downloads', 'metadata', "TEXT NOT NULL DEFAULT '{}'");
  add('catalog_staged', 'metadata', "TEXT NOT NULL DEFAULT '{}'");
  add('catalog_runs', 'rule_revision', "TEXT NOT NULL DEFAULT ''");
  add('catalog_runs', 'stats', "TEXT NOT NULL DEFAULT '{}'");
  db.exec(`INSERT INTO catalog_software_sites(site_id,software_id)
    SELECT DISTINCT d.site_id,v.software_id FROM catalog_downloads d JOIN catalog_versions v ON v.id=d.version_id WHERE 1 ON CONFLICT DO NOTHING;`);
}

export interface Software {
  slug: string;
  resourceKey: string;
  name: string;
  aliases: string[];
  category: string;
  repo: string;
  tutorialId?: string;
  ecosystemId?: string;
  kind?: 'installer' | 'iso';
}
export interface Download {
  version: string;
  filename: string;
  url: string;
  platform: 'windows' | 'macos' | 'linux' | 'any' | 'unknown';
  arch: string;
  format: string;
  size?: number;
  checksum?: { algorithm: string; value: string };
  metadata?: {
    platforms?: string[];
    purpose?: string;
    variant?: Record<string, string>;
    [key: string]: unknown;
  };
}
export class CatalogPublishError extends Error {}

export function syncSites(db: DatabaseSync, mirrors: Mirror[]) {
  const insert = db.prepare(`INSERT INTO catalog_sites(slug,name,payload) VALUES(?,?,?)
    ON CONFLICT(slug) DO UPDATE SET name=excluded.name,payload=excluded.payload`);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const mirror of mirrors) insert.run(mirror.id, mirror.name, JSON.stringify(mirror));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function registerSoftware(db: DatabaseSync, software: Software): number {
  db.prepare(
    `INSERT INTO catalog_software(slug,resource_key,name,aliases,category,repo,tutorial_id)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET resource_key=excluded.resource_key,
    name=excluded.name,aliases=excluded.aliases,category=excluded.category,repo=excluded.repo,tutorial_id=excluded.tutorial_id`,
  ).run(
    software.slug,
    software.resourceKey,
    software.name,
    JSON.stringify(software.aliases),
    software.category,
    software.repo,
    software.tutorialId ?? null,
  );
  const id = (
    db.prepare('SELECT id FROM catalog_software WHERE slug=?').get(software.slug) as { id: number }
  ).id;
  if (software.kind)
    db.prepare('UPDATE catalog_software SET kind=? WHERE id=?').run(software.kind, id);
  if (software.ecosystemId)
    db.prepare(
      'UPDATE catalog_software SET ecosystem_id=(SELECT id FROM catalog_ecosystems WHERE slug=?) WHERE id=?',
    ).run(software.ecosystemId, id);
  db.prepare(
    "INSERT INTO catalog_software_sites(site_id,software_id) SELECT id,? FROM catalog_sites WHERE slug='pku' ON CONFLICT DO NOTHING",
  ).run(id);
  return id;
}

export function beginRun(
  db: DatabaseSync,
  site: string,
  software: string,
  directory: string,
  epoch: number,
  now = Date.now(),
  ruleRevision = '',
): number {
  if (site !== 'pku') throw new CatalogPublishError('禁止采集未启用站点');
  const root = sourceUrl(directory);
  if (!root.pathname.endsWith('/') || root.search)
    throw new CatalogPublishError('采集范围必须为真实目录');
  const siteRow = db.prepare('SELECT id FROM catalog_sites WHERE slug=?').get(site) as
    { id: number } | undefined;
  const softwareRow = db.prepare('SELECT id FROM catalog_software WHERE slug=?').get(software) as
    { id: number } | undefined;
  if (!siteRow || !softwareRow) throw new CatalogPublishError('站点或软件未登记');
  db.prepare(
    `INSERT INTO catalog_scopes(site_id,software_id,directory) VALUES(?,?,?) ON CONFLICT DO NOTHING`,
  ).run(siteRow.id, softwareRow.id, root.href);
  const scope = db
    .prepare(
      'SELECT id,enabled,discovered_epoch FROM catalog_scopes WHERE site_id=? AND software_id=? AND directory=?',
    )
    .get(siteRow.id, softwareRow.id, root.href) as {
    id: number;
    enabled: number;
    discovered_epoch: number;
  };
  if (!scope.enabled || epoch < scope.discovered_epoch)
    throw new CatalogPublishError('目录已撤销或任务已过时');
  return Number(
    db
      .prepare(
        `INSERT INTO catalog_runs(scope_id,epoch,state,started_at,rule_revision) VALUES(?,?,'staging',?,?)`,
      )
      .run(scope.id, epoch, now, ruleRevision).lastInsertRowid,
  );
}

export function stageDownloads(db: DatabaseSync, run: number, downloads: Download[]) {
  const row = db
    .prepare(
      `SELECT r.state,s.directory,s.software_id FROM catalog_runs r JOIN catalog_scopes s ON s.id=r.scope_id WHERE r.id=?`,
    )
    .get(run) as { state: string; directory: string; software_id: number } | undefined;
  if (!row || row.state !== 'staging') throw new CatalogPublishError('只能写入进行中的采集');
  const insert =
    db.prepare(`INSERT INTO catalog_staged(run_id,version,filename,url,platform,arch,format,size,checksum,metadata)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(run_id,url) DO UPDATE SET version=excluded.version,
    filename=excluded.filename,platform=excluded.platform,arch=excluded.arch,format=excluded.format,size=excluded.size,checksum=excluded.checksum,metadata=excluded.metadata`);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const file of downloads) {
      const url = sourceUrl(file.url, row.directory);
      if (
        !file.version ||
        !file.filename ||
        url.pathname.endsWith('/') ||
        !['windows', 'macos', 'linux', 'any', 'unknown'].includes(file.platform) ||
        !file.format ||
        (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size < 0))
      )
        throw new CatalogPublishError('下载条目无效');
      const owner = db
        .prepare(
          `SELECT v.software_id FROM catalog_downloads d JOIN catalog_versions v ON v.id=d.version_id WHERE d.url=?`,
        )
        .get(url.href) as { software_id: number } | undefined;
      if (owner && owner.software_id !== row.software_id)
        throw new CatalogPublishError('同一URL的软件归属冲突，不能覆盖');
      const metadata = JSON.stringify(file.metadata ?? {});
      if (
        metadata.length > 4096 ||
        (file.metadata?.platforms &&
          file.metadata.platforms.some(
            (platform) => !['windows', 'macos', 'linux'].includes(platform),
          ))
      )
        throw new CatalogPublishError('下载元数据无效或超限');
      insert.run(
        run,
        file.version,
        file.filename,
        url.href,
        file.platform,
        file.arch,
        file.format,
        file.size ?? null,
        file.checksum ? JSON.stringify(file.checksum) : null,
        metadata,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** 只用完整范围更新有效数据；重试不会复制文件，较早待办不能回滚新数据。 */
export function publishRun(
  db: DatabaseSync,
  run: number,
  now = Date.now(),
  children?: string[],
  retainedUrls: readonly string[] = [],
): number {
  db.exec('SAVEPOINT catalog_publish');
  try {
    const row = db
      .prepare(
        `SELECT r.state,r.epoch,r.scope_id,s.site_id,s.software_id,s.directory,s.enabled,s.discovered_epoch,s.epoch AS active_epoch
      FROM catalog_runs r JOIN catalog_scopes s ON s.id=r.scope_id WHERE r.id=?`,
      )
      .get(run) as
      | {
          state: string;
          epoch: number;
          scope_id: number;
          site_id: number;
          software_id: number;
          directory: string;
          enabled: number;
          discovered_epoch: number;
          active_epoch: number;
        }
      | undefined;
    if (!row || row.state !== 'staging') throw new CatalogPublishError('采集已结束或不存在');
    if (!row.enabled || row.epoch < Math.max(row.active_epoch, row.discovered_epoch))
      throw new CatalogPublishError('旧采集不能覆盖新数据');
    const staged = db.prepare('SELECT COUNT(*) n FROM catalog_staged WHERE run_id=?').get(run) as {
      n: number;
    };
    const old = db
      .prepare('SELECT COUNT(*) n FROM catalog_downloads WHERE scope_id=?')
      .get(row.scope_id) as { n: number };
    const retain = db.prepare('UPDATE catalog_downloads SET seen_run=? WHERE scope_id=? AND url=?');
    for (const url of new Set(retainedUrls))
      retain.run(run, row.scope_id, sourceUrl(url, row.directory).href);
    const retained = (
      db
        .prepare('SELECT COUNT(*) n FROM catalog_downloads WHERE scope_id=? AND seen_run=?')
        .get(row.scope_id, run) as { n: number }
    ).n;
    if (old.n > 0 && (staged.n + retained === 0 || staged.n + retained < old.n * 0.5))
      throw new CatalogPublishError('异常空或数量突降的结果不能覆盖');
    db.prepare(
      `INSERT INTO catalog_versions(software_id,version) SELECT ?,version FROM catalog_staged WHERE run_id=?
      GROUP BY version ON CONFLICT DO NOTHING`,
    ).run(row.software_id, run);
    db.prepare(
      `INSERT INTO catalog_downloads(version_id,site_id,scope_id,filename,url,platform,arch,format,size,checksum,seen_run,crawled_at,metadata)
      SELECT v.id,?,?,t.filename,t.url,t.platform,t.arch,t.format,t.size,t.checksum,?,?,t.metadata
      FROM catalog_staged t JOIN catalog_versions v ON v.software_id=? AND v.version=t.version WHERE t.run_id=?
      ON CONFLICT(url) DO UPDATE SET version_id=excluded.version_id,site_id=excluded.site_id,scope_id=excluded.scope_id,
      filename=excluded.filename,platform=excluded.platform,arch=excluded.arch,format=excluded.format,size=excluded.size,
      checksum=excluded.checksum,seen_run=excluded.seen_run,crawled_at=excluded.crawled_at,metadata=excluded.metadata`,
    ).run(row.site_id, row.scope_id, run, now, row.software_id, run);
    db.prepare('DELETE FROM catalog_downloads WHERE scope_id=? AND seen_run<>?').run(
      row.scope_id,
      run,
    );
    if (children) {
      const keep = new Set(children.map((value) => sourceUrl(value, row.directory).href));
      const previous = db
        .prepare('SELECT id,directory FROM catalog_scopes WHERE parent_id=? AND enabled=1')
        .all(row.scope_id) as { id: number; directory: string }[];
      for (const child of previous) {
        if (keep.has(child.directory)) continue;
        const subtree = `WITH RECURSIVE gone(id) AS (SELECT ? UNION ALL SELECT s.id FROM catalog_scopes s JOIN gone g ON s.parent_id=g.id)`;
        db.prepare(
          `${subtree} DELETE FROM catalog_downloads WHERE scope_id IN (SELECT id FROM gone)`,
        ).run(child.id);
        db.prepare(
          `${subtree} UPDATE catalog_scopes SET enabled=0,revision=revision+1,discovered_epoch=? WHERE id IN (SELECT id FROM gone)`,
        ).run(child.id, row.epoch);
      }
      const discover =
        db.prepare(`INSERT INTO catalog_scopes(site_id,software_id,directory,parent_id,discovered_epoch)
        VALUES(?,?,?,?,?) ON CONFLICT(site_id,software_id,directory) DO UPDATE SET parent_id=excluded.parent_id,
        enabled=1,discovered_epoch=excluded.discovered_epoch WHERE catalog_scopes.discovered_epoch<=excluded.discovered_epoch`);
      for (const directory of keep)
        discover.run(row.site_id, row.software_id, directory, row.scope_id, row.epoch);
    }
    db.prepare('UPDATE catalog_scopes SET epoch=?,revision=revision+1,checked_at=? WHERE id=?').run(
      row.epoch,
      now,
      row.scope_id,
    );
    db.prepare("UPDATE catalog_runs SET state='complete',finished_at=? WHERE id=?").run(now, run);
    db.prepare('DELETE FROM catalog_staged WHERE run_id=?').run(run);
    db.exec('RELEASE catalog_publish');
    return staged.n;
  } catch (error) {
    db.exec('ROLLBACK TO catalog_publish; RELEASE catalog_publish');
    throw error;
  }
}

export function failRun(db: DatabaseSync, run: number, error: unknown, now = Date.now()) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM catalog_staged WHERE run_id=?').run(run);
    db.prepare(
      "UPDATE catalog_runs SET state='failed',finished_at=?,error=? WHERE id=? AND state='staging'",
    ).run(now, String(error).slice(0, 2000), run);
    db.exec('COMMIT');
  } catch (failure) {
    db.exec('ROLLBACK');
    throw failure;
  }
}

/** 进程中断的暂存数据不是有效文件；任务由BullMQ重新执行。 */
export function recoverRuns(db: DatabaseSync) {
  const abandoned = db.prepare("SELECT id FROM catalog_runs WHERE state='staging'").all() as {
    id: number;
  }[];
  for (const run of abandoned) failRun(db, run.id, '上次采集中断，重新采集');
  db.prepare(
    'DELETE FROM catalog_versions WHERE NOT EXISTS(SELECT 1 FROM catalog_downloads d WHERE d.version_id=catalog_versions.id)',
  ).run();
  db.prepare("DELETE FROM catalog_runs WHERE state<>'staging' AND finished_at<?").run(
    Date.now() - 7 * 86400000,
  );
}
