import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  assertEnabledResource,
  sourceUrl,
  type IndexedFile,
  type ScopeSpec,
} from '../indexing/policy.js';

export class SnapshotPublishError extends Error {}

export function installSnapshots(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_details(site_id TEXT PRIMARY KEY REFERENCES sites(id),payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS upstream_catalog(site_id TEXT PRIMARY KEY,payload TEXT NOT NULL,checked_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS crawl_scopes (
      id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES resources(id), protocol TEXT NOT NULL,
      index_url TEXT NOT NULL, base_url TEXT NOT NULL, release TEXT NOT NULL DEFAULT '',
      component TEXT NOT NULL DEFAULT '', architecture TEXT NOT NULL DEFAULT '',
      active_snapshot_id TEXT, generation INTEGER NOT NULL DEFAULT 0, last_success_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS scope_resource ON crawl_scopes(resource_id);
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY, scope_id TEXT NOT NULL REFERENCES crawl_scopes(id), generation INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('staging','active','replaced','rejected')),
      started_at INTEGER NOT NULL, completed_at INTEGER, replaced_at INTEGER, file_count INTEGER NOT NULL DEFAULT 0,
      index_digest TEXT, error TEXT, publication_seq INTEGER, discovery_epoch INTEGER NOT NULL DEFAULT 0, UNIQUE(scope_id, generation)
    );
    CREATE INDEX IF NOT EXISTS snapshot_publication ON snapshots(scope_id, publication_seq);
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      package_name TEXT NOT NULL, version TEXT NOT NULL, filename TEXT NOT NULL, url TEXT NOT NULL,
      size INTEGER, role TEXT NOT NULL, platform TEXT NOT NULL, arch TEXT NOT NULL, format TEXT NOT NULL,
      checksum TEXT, compatibility TEXT NOT NULL DEFAULT '{}', mtime TEXT,
      UNIQUE(snapshot_id, url, package_name, version, arch)
    );
    CREATE INDEX IF NOT EXISTS file_snapshot_package ON files(snapshot_id, package_name COLLATE NOCASE, id);
    CREATE INDEX IF NOT EXISTS file_snapshot_package_exact ON files(snapshot_id, package_name, id);
    CREATE INDEX IF NOT EXISTS file_snapshot_filters ON files(snapshot_id, arch, role, version, id);
    CREATE VIEW IF NOT EXISTS effective_files AS
      SELECT f.id, s.resource_id, f.snapshot_id, f.package_name, f.version, f.filename, f.url, f.size,
        f.role, f.platform, f.arch, f.format, f.checksum, f.compatibility, f.mtime,
        s.release, s.component, n.completed_at AS crawled_at
      FROM files f JOIN snapshots n ON n.id = f.snapshot_id
      JOIN crawl_scopes s ON s.active_snapshot_id = n.id
      UNION ALL
      SELECT -a.rowid AS id, a.resource_id, 'legacy' AS snapshot_id, '' AS package_name, a.version,
        a.filename, a.url, a.size,
        CASE r.kind WHEN 'installer' THEN 'installer' WHEN 'iso' THEN 'iso' ELSE 'firmware' END AS role,
        a.platform, a.arch, a.format, NULL AS checksum, '{}' AS compatibility, a.mtime,
        '' AS release, '' AS component, a.crawled_at
      FROM artifacts a JOIN resources r ON r.id = a.resource_id
      WHERE r.kind <> 'dataset' AND NOT EXISTS (
        SELECT 1 FROM crawl_scopes s WHERE s.resource_id = a.resource_id AND s.active_snapshot_id IS NOT NULL
        AND substr(a.url, 1, length(s.base_url)) = s.base_url
        AND instr(substr(a.url, length(s.base_url) + 1), '/') = 0
      );
  `);
  const columns = db.prepare('PRAGMA table_info(snapshots)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'discovery_epoch'))
    db.exec('ALTER TABLE snapshots ADD COLUMN discovery_epoch INTEGER NOT NULL DEFAULT 0');
}

export function scopeId(scope: ScopeSpec): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        scope.resourceId,
        scope.protocol,
        scope.baseUrl,
        scope.release ?? '',
        scope.component ?? '',
        scope.architecture ?? '',
      ]),
    )
    .digest('hex');
}

/** 重试只重建自己的暂存批次；从不清空当前有效批次。 */
export function beginSnapshot(db: DatabaseSync, scope: ScopeSpec, jobId: string, at = Date.now()) {
  assertEnabledResource(scope.resourceId);
  sourceUrl(scope.indexUrl);
  sourceUrl(scope.baseUrl);
  const id = scopeId(scope);
  const snapshotId = createHash('sha256').update(`${id}:${jobId}`).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO crawl_scopes(id,resource_id,protocol,index_url,base_url,release,component,architecture)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET index_url=excluded.index_url,base_url=excluded.base_url`,
    ).run(
      id,
      scope.resourceId,
      scope.protocol,
      scope.indexUrl,
      scope.baseUrl,
      scope.release ?? '',
      scope.component ?? '',
      scope.architecture ?? '',
    );
    const previous = db
      .prepare('SELECT state, generation FROM snapshots WHERE id = ?')
      .get(snapshotId) as { state: string; generation: number } | undefined;
    if (previous?.state === 'active' || previous?.state === 'replaced') {
      db.exec('COMMIT');
      return { id: snapshotId, scopeId: id, alreadyPublished: true };
    }
    if (!previous)
      db.prepare('UPDATE crawl_scopes SET generation = generation + 1 WHERE id = ?').run(id);
    const generation =
      previous?.generation ??
      (
        db.prepare('SELECT generation FROM crawl_scopes WHERE id = ?').get(id) as {
          generation: number;
        }
      ).generation;
    db.prepare('DELETE FROM files WHERE snapshot_id = ?').run(snapshotId);
    db.prepare(
      `INSERT INTO snapshots(id,scope_id,generation,state,started_at,discovery_epoch) VALUES(?,?,?,'staging',?,?)
      ON CONFLICT(id) DO UPDATE SET state='staging',started_at=excluded.started_at,
      completed_at=NULL,file_count=0,error=NULL`,
    ).run(snapshotId, id, generation, at, scope.discoveryEpoch ?? 0);
    db.exec('COMMIT');
    return { id: snapshotId, scopeId: id, alreadyPublished: false };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function stageFiles(db: DatabaseSync, snapshotId: string, files: IndexedFile[]): void {
  const state = db
    .prepare(
      'SELECT n.state,s.base_url FROM snapshots n JOIN crawl_scopes s ON s.id=n.scope_id WHERE n.id = ?',
    )
    .get(snapshotId) as { state: string; base_url: string } | undefined;
  if (state?.state !== 'staging') throw new Error('只能写入暂存批次');
  const insert =
    db.prepare(`INSERT INTO files(snapshot_id,package_name,version,filename,url,size,role,platform,arch,format,checksum,compatibility,mtime)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(snapshot_id,url,package_name,version,arch) DO NOTHING`);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const file of files) {
      const url = sourceUrl(file.url, state.base_url);
      if (
        !file.filename ||
        url.pathname.endsWith('/') ||
        !file.format ||
        (file.size !== null && (!Number.isSafeInteger(file.size) || file.size < 0))
      )
        throw new Error('实际文件记录无效');
      insert.run(
        snapshotId,
        file.packageName,
        file.version,
        file.filename,
        url.href,
        file.size,
        file.role,
        file.platform,
        file.arch,
        file.format,
        file.checksum ? JSON.stringify(file.checksum) : null,
        JSON.stringify(file.compatibility ?? {}),
        file.mtime ?? null,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** 整份索引完成后调用。异常空/数量突降、较旧代次均不覆盖；人工解除异常另行处理。 */
export function publishSnapshot(
  db: DatabaseSync,
  id: string,
  digest: string,
  at = Date.now(),
): number {
  db.exec('BEGIN IMMEDIATE');
  try {
    const next = db
      .prepare(
        `SELECT n.*,s.active_snapshot_id FROM snapshots n JOIN crawl_scopes s ON s.id=n.scope_id WHERE n.id=?`,
      )
      .get(id) as
      | {
          scope_id: string;
          generation: number;
          discovery_epoch: number;
          state: string;
          active_snapshot_id: string | null;
        }
      | undefined;
    if (!next) throw new Error('批次不存在');
    const { count } = db
      .prepare('SELECT COUNT(*) AS count FROM files WHERE snapshot_id=?')
      .get(id) as { count: number };
    if (next.state === 'active' || next.state === 'replaced') {
      db.exec('COMMIT');
      return count;
    }
    if (next.state !== 'staging' || count === 0)
      throw new SnapshotPublishError('空索引或未完成批次不能发布');
    const old = next.active_snapshot_id
      ? (db
          .prepare('SELECT generation,file_count,discovery_epoch FROM snapshots WHERE id=?')
          .get(next.active_snapshot_id) as
          { generation: number; file_count: number; discovery_epoch: number } | undefined)
      : undefined;
    if (
      old &&
      (old.discovery_epoch > next.discovery_epoch ||
        old.generation > next.generation ||
        count < old.file_count * 0.5)
    )
      throw new SnapshotPublishError('较旧或文件数异常减少的批次不能覆盖');
    if (next.active_snapshot_id)
      db.prepare("UPDATE snapshots SET state='replaced',replaced_at=? WHERE id=?").run(
        at,
        next.active_snapshot_id,
      );
    db.prepare(
      "UPDATE snapshots SET state='active',completed_at=?,file_count=?,index_digest=?,publication_seq=(SELECT COALESCE(MAX(publication_seq),0)+1 FROM snapshots) WHERE id=?",
    ).run(at, count, digest, id);
    db.prepare('UPDATE crawl_scopes SET active_snapshot_id=?,last_success_at=? WHERE id=?').run(
      id,
      at,
      next.scope_id,
    );
    db.exec('COMMIT');
    return count;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function rejectSnapshot(db: DatabaseSync, id: string, error: unknown): void {
  db.prepare("UPDATE snapshots SET state='rejected',error=? WHERE id=? AND state='staging'").run(
    String(error).slice(0, 2000),
    id,
  );
}

/** 游标最长有效一小时；被替换批次至少保留一天。 */
export function collectOldSnapshots(db: DatabaseSync, at = Date.now()): void {
  db.prepare(
    `DELETE FROM snapshots WHERE state IN ('replaced','rejected') AND COALESCE(replaced_at,completed_at,started_at) < ?
    AND id NOT IN (SELECT active_snapshot_id FROM crawl_scopes WHERE active_snapshot_id IS NOT NULL)`,
  ).run(at - 24 * 60 * 60 * 1000);
}
