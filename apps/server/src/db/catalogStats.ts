import type { DatabaseSync } from 'node:sqlite';

/** 昂贵的唯一链接统计在写入侧计算；读接口只查SQLite中的汇总记录。 */
export function updateFileStats(db: DatabaseSync, resource: string) {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT url) n FROM (
 SELECT f.url FROM crawl_scopes c CROSS JOIN files f ON f.snapshot_id=c.active_snapshot_id WHERE c.resource_id=?
 UNION ALL SELECT a.url FROM artifacts a JOIN resources r ON r.id=a.resource_id WHERE a.resource_id=? AND r.kind<>'dataset'
 AND NOT EXISTS (SELECT 1 FROM crawl_scopes c WHERE c.resource_id=a.resource_id AND c.active_snapshot_id IS NOT NULL
 AND substr(a.url,1,length(c.base_url))=c.base_url AND instr(substr(a.url,length(c.base_url)+1),'/')=0))`,
    )
    .get(resource, resource) as { n: number };
  db.prepare(
    `INSERT INTO resource_file_stats(resource_id,file_count) VALUES(?,?) ON CONFLICT(resource_id) DO UPDATE SET file_count=excluded.file_count`,
  ).run(resource, row.n);
}
export function initializeFileStats(db: DatabaseSync) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS resource_file_stats(resource_id TEXT PRIMARY KEY REFERENCES resources(id),file_count INTEGER NOT NULL)',
  );
  const rows = db
    .prepare(
      'SELECT id FROM resources WHERE id NOT IN (SELECT resource_id FROM resource_file_stats)',
    )
    .all() as { id: string }[];
  for (const row of rows) updateFileStats(db, row.id);
}
