import type { DatabaseSync } from 'node:sqlite';
import { recommendationRule, selectRecommendedVersions } from '../indexing/recommendations.js';
import type { RuleSet } from '../indexing/rules/load.js';

/**
 * 历史数据清理：只处理适用了版本策略的软件（软件级 → 生态级 → 默认）。
 * 作用范围与采集侧完全一致，否则目录或清单刷新会因为“数量突降”被拦下。
 */
export function applyVersionPolicy(db: DatabaseSync, rules: RuleSet, now = Date.now()): number {
  const rows = db
    .prepare(
      `SELECT w.slug software,v.id version_id,v.version FROM catalog_versions v
      JOIN catalog_software w ON w.id=v.software_id`,
    )
    .all() as Array<{ software: string; version_id: number; version: string }>;
  const bySoftware = new Map<string, Array<{ id: number; version: string }>>();
  for (const row of rows) {
    const list = bySoftware.get(row.software);
    if (list) list.push({ id: row.version_id, version: row.version });
    else bySoftware.set(row.software, [{ id: row.version_id, version: row.version }]);
  }
  const dropDownloads = db.prepare('DELETE FROM catalog_downloads WHERE version_id=?');
  const dropEmptyVersions = db.prepare(
    'DELETE FROM catalog_versions WHERE NOT EXISTS(SELECT 1 FROM catalog_downloads d WHERE d.version_id=catalog_versions.id)',
  );
  let removed = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [software, versions] of bySoftware) {
      if (versions.length < 2 || !recommendationRule(rules, software)) continue;
      const keep = new Set(
        selectRecommendedVersions(
          rules,
          software,
          versions.map((item) => item.version),
          now,
        ),
      );
      const stale = versions.filter((item) => !keep.has(item.version));
      if (stale.length === versions.length) continue;
      for (const item of stale) removed += Number(dropDownloads.run(item.id).changes);
      dropEmptyVersions.run();
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return removed;
}
