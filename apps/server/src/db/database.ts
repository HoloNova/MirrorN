import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { installCatalog } from './installers.js';

// 打包器不应把Node内置sqlite解析成npm包；SQL引擎来自生产Node 24。
const requireBuiltin = createRequire(import.meta.url);
const { DatabaseSync } = requireBuiltin('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };

/** 独立软件安装目录，不自动导入或删除旧的mirrorn.sqlite全量包数据。 */
export function openInstallerDatabase(path: string): DatabaseSyncType {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  installCatalog(db);
  return db;
}
export function openReadDatabase(path: string): DatabaseSyncType {
  const db = new DatabaseSync(path, { readOnly: true });
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000');
  return db;
}
