import type { DatabaseSync } from 'node:sqlite';

/** 一条下载可同时被目录和精选清单证实；URL仍只保存一份。 */
export function installDownloadSources(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS catalog_download_sources (
    scope_id INTEGER NOT NULL REFERENCES catalog_scopes(id),
    download_id INTEGER NOT NULL REFERENCES catalog_downloads(id) ON DELETE CASCADE,
    seen_run INTEGER NOT NULL,
    PRIMARY KEY(scope_id,download_id)
  );
  CREATE INDEX IF NOT EXISTS download_sources_download ON catalog_download_sources(download_id);
  INSERT INTO catalog_download_sources(scope_id,download_id,seen_run)
    SELECT scope_id,id,seen_run FROM catalog_downloads WHERE 1 ON CONFLICT DO NOTHING;`);
}

export function retainSourceUrls(
  db: DatabaseSync,
  scope: number,
  run: number,
  urls: readonly string[],
) {
  const retain = db.prepare(`UPDATE catalog_download_sources SET seen_run=? WHERE scope_id=?
    AND download_id=(SELECT id FROM catalog_downloads WHERE url=?)`);
  for (const url of new Set(urls)) retain.run(run, scope, url);
  return (
    db
      .prepare('SELECT COUNT(*) n FROM catalog_download_sources WHERE scope_id=? AND seen_run=?')
      .get(scope, run) as { n: number }
  ).n;
}

export function publishSourceMembers(db: DatabaseSync, scope: number, run: number) {
  db.prepare(
    `INSERT INTO catalog_download_sources(scope_id,download_id,seen_run)
    SELECT ?,d.id,? FROM catalog_staged t JOIN catalog_downloads d ON d.url=t.url WHERE t.run_id=?
    ON CONFLICT(scope_id,download_id) DO UPDATE SET seen_run=excluded.seen_run`,
  ).run(scope, run, run);
  db.prepare('DELETE FROM catalog_download_sources WHERE scope_id=? AND seen_run<>?').run(
    scope,
    run,
  );
}

/** 清理最后一个来源消失的下载；其余文件转交仍有效的范围，不能因单一来源撤销而删掉。 */
export function reconcileDownloadSources(db: DatabaseSync) {
  db.exec(`DELETE FROM catalog_downloads WHERE NOT EXISTS (
    SELECT 1 FROM catalog_download_sources m WHERE m.download_id=catalog_downloads.id
  );
  UPDATE catalog_downloads SET scope_id=(
    SELECT m.scope_id FROM catalog_download_sources m JOIN catalog_scopes s ON s.id=m.scope_id
    WHERE m.download_id=catalog_downloads.id ORDER BY s.source_kind='directory' DESC,m.scope_id LIMIT 1
  ) WHERE NOT EXISTS (
    SELECT 1 FROM catalog_download_sources m WHERE m.download_id=catalog_downloads.id AND m.scope_id=catalog_downloads.scope_id
  );`);
}

export function downloadUpsertFields(kind: 'directory' | 'official') {
  const preferDirectory = `(SELECT source_kind FROM catalog_scopes WHERE id=catalog_downloads.scope_id)='directory'`;
  const fields = [
    'version_id',
    'site_id',
    'scope_id',
    'filename',
    'platform',
    'arch',
    'format',
    'seen_run',
    'crawled_at',
  ];
  const assignments = fields.map(
    (field) =>
      `${field}=${kind === 'official' ? `CASE WHEN ${preferDirectory} THEN catalog_downloads.${field} ELSE excluded.${field} END` : `excluded.${field}`}`,
  );
  return [
    ...assignments,
    'size=COALESCE(excluded.size,catalog_downloads.size)',
    'checksum=COALESCE(excluded.checksum,catalog_downloads.checksum)',
    `metadata=json_patch(${kind === 'official' ? `CASE WHEN ${preferDirectory} THEN excluded.metadata ELSE catalog_downloads.metadata END,CASE WHEN ${preferDirectory} THEN catalog_downloads.metadata ELSE excluded.metadata END` : 'catalog_downloads.metadata,excluded.metadata'})`,
  ].join(',');
}
