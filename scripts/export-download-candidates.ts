// 本地只读导出，不开放管理API，不访问源站，不加载或改动生产规则。
import { openReadDatabase } from '../apps/server/src/db/database.js';
const path = process.argv[2];
if (!path)
  throw new Error('用法：pnpm exec tsx scripts/export-download-candidates.ts <SQLite路径>');
const db = openReadDatabase(path);
try {
  const rows = db
    .prepare(
      `SELECT binding_id,reason,signature,samples,observations,first_seen,last_seen,rule_revision FROM catalog_pending ORDER BY last_seen DESC LIMIT 2000`,
    )
    .all() as { samples: string; [key: string]: unknown }[];
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        status: 'pending_review',
        samplesAreNotDownloadInventory: true,
        groups: rows.map((row) => ({ ...row, samples: JSON.parse(row.samples) as unknown })),
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
