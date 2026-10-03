import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/** 只留结构样本，不把未知文件变成第二份文件库。每入口100组/每组3样本/全局2000组。 */
export function recordPending(
  db: DatabaseSync,
  binding: string,
  reason: string,
  directory: string,
  name: string,
  revision: string,
  now = Date.now(),
): boolean {
  const structure = name.slice(0, 512).replace(/\d+/g, '#');
  const signature = createHash('sha256').update(`${reason}:${structure}`).digest('hex');
  const row = db
    .prepare(
      'SELECT samples,observations FROM catalog_pending WHERE binding_id=? AND reason=? AND signature=?',
    )
    .get(binding, reason, signature) as { samples: string; observations: number } | undefined;
  const sample = { directory: directory.slice(0, 600), name: name.slice(0, 512) };
  if (row) {
    const samples = JSON.parse(row.samples) as { directory: string; name: string }[];
    if (
      samples.length < 3 &&
      !samples.some((old) => old.name === sample.name && old.directory === sample.directory)
    )
      samples.push(sample);
    db.prepare(
      'UPDATE catalog_pending SET samples=?,observations=observations+1,last_seen=?,rule_revision=? WHERE binding_id=? AND reason=? AND signature=?',
    ).run(JSON.stringify(samples), now, revision, binding, reason, signature);
    return true;
  }
  const count = db
    .prepare(
      'SELECT COUNT(*) total,SUM(CASE WHEN binding_id=? THEN 1 ELSE 0 END) local FROM catalog_pending',
    )
    .get(binding) as { total: number; local: number };
  if (count.total >= 2000 || count.local >= 100) return false;
  db.prepare('INSERT INTO catalog_pending VALUES(?,?,?,?,1,?,?,?)').run(
    binding,
    reason,
    signature,
    JSON.stringify([sample]),
    now,
    now,
    revision,
  );
  return true;
}
export function prunePending(db: DatabaseSync, now = Date.now()) {
  db.prepare('DELETE FROM catalog_pending WHERE last_seen<?').run(now - 30 * 86400000);
}

export function resolvePending(
  db: DatabaseSync,
  binding: string,
  directory: string,
  classifiedNames: ReadonlySet<string>,
) {
  const rows = db
    .prepare('SELECT reason,signature,samples FROM catalog_pending WHERE binding_id=?')
    .all(binding) as { reason: string; signature: string; samples: string }[];
  for (const row of rows) {
    const samples = (JSON.parse(row.samples) as { directory: string; name: string }[]).filter(
      (sample) => sample.directory !== directory || !classifiedNames.has(sample.name),
    );
    if (samples.length === 0)
      db.prepare('DELETE FROM catalog_pending WHERE binding_id=? AND reason=? AND signature=?').run(
        binding,
        row.reason,
        row.signature,
      );
    else if (JSON.stringify(samples) !== row.samples)
      db.prepare(
        'UPDATE catalog_pending SET samples=? WHERE binding_id=? AND reason=? AND signature=?',
      ).run(JSON.stringify(samples), binding, row.reason, row.signature);
  }
}
