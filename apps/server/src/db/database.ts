import { createRequire } from 'node:module';
import { installSnapshots } from './snapshots.js';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

/**
 * `node:sqlite` 只以运行时 require 引入：Vite（单测）与 esbuild（打包）的内置模块名单里都还没有
 * 它，写成静态 import 会让两边都把 `sqlite` 当成 npm 包去解析。类型仍然来自 `node:sqlite`
 * （纯类型导入，编译后不留痕迹）。
 */
const requireBuiltin = createRequire(import.meta.url);
const { DatabaseSync } = requireBuiltin('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };

/**
 * 站点资源的数据库（Node 24 自带的 node:sqlite，不引入新依赖）。
 *
 * 分工：`data/*.json` 是**人工审阅过的事实**（站点身份、官方目录、生态归类、教程清单），
 * 每次启动都按它对齐一次；数据库存的是**抓回来的、会变的东西**（文件清单、版本、大小、
 * 抓取时间与抓取日志）。页面只读数据库，因此“库里没有”就等于“我们还没抓到”，不会出现
 * 静态文件与数据库各说一套。
 */
export function openDatabase(path: string): DatabaseSyncType {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  installSnapshots(db);
  return db;
}

export function openReadDatabase(path: string): DatabaseSyncType {
  const db = new DatabaseSync(path, { readOnly: true });
  db.exec('PRAGMA query_only = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

export function migrate(db: DatabaseSyncType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      homepage_url TEXT NOT NULL,
      aliases TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ecosystems (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      category TEXT NOT NULL,
      aliases TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      repo_id TEXT NOT NULL,
      name TEXT NOT NULL,
      ecosystem_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      download_entry TEXT NOT NULL,
      versions_hint TEXT NOT NULL,
      crawl_depth INTEGER,
      platforms TEXT NOT NULL,
      help_doc_url TEXT,
      tutorial_id TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_resources_site ON resources (site_id);
    CREATE INDEX IF NOT EXISTS idx_resources_ecosystem ON resources (ecosystem_id);

    CREATE TABLE IF NOT EXISTS artifacts (
      resource_id TEXT NOT NULL,
      version TEXT NOT NULL,
      platform TEXT NOT NULL,
      arch TEXT NOT NULL,
      format TEXT NOT NULL,
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      size INTEGER,
      mtime TEXT,
      crawled_at INTEGER NOT NULL,
      PRIMARY KEY (resource_id, url)
    );

    CREATE INDEX IF NOT EXISTS idx_artifacts_resource ON artifacts (resource_id, version);

    CREATE TABLE IF NOT EXISTS crawl_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      ok INTEGER,
      files_seen INTEGER,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_crawl_runs_resource ON crawl_runs (resource_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS directory_cache (
      resource_id TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      checked_at INTEGER NOT NULL,
      PRIMARY KEY (resource_id, cache_key)
    );
  `);

  // 列级迁移：`CREATE TABLE IF NOT EXISTS` 不会给已存在的表加列，而生产库是一直留着的。
  ensureColumn(db, 'sites', 'aliases', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'resources', 'crawl_depth', 'INTEGER');
  ensureColumn(db, 'crawl_runs', 'result', "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, 'crawl_runs', 'requests', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'crawl_runs', 'network_bytes', 'INTEGER NOT NULL DEFAULT 0');
  migrateArtifactKey(db);
}

/**
 * 主键从 (resource_id, filename) 改成 (resource_id, url)：同一个文件名会在不同版本目录里重复出现
 * （固件包、数据集分片就是如此），按文件名去重会把其它版本的行挤掉，页面就只剩最后处理的那一个版本。
 */
function migrateArtifactKey(db: DatabaseSyncType): void {
  const columns = db.prepare('PRAGMA table_info(artifacts)').all() as unknown as Array<{
    name: string;
    pk: number;
  }>;
  const filename = columns.find((entry) => entry.name === 'filename');
  const url = columns.find((entry) => entry.name === 'url');
  if (filename === undefined || url === undefined || filename.pk === 0) return;
  db.exec(`
    ALTER TABLE artifacts RENAME TO artifacts_legacy;
    CREATE TABLE artifacts (
      resource_id TEXT NOT NULL,
      version TEXT NOT NULL,
      platform TEXT NOT NULL,
      arch TEXT NOT NULL,
      format TEXT NOT NULL,
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      size INTEGER,
      mtime TEXT,
      crawled_at INTEGER NOT NULL,
      PRIMARY KEY (resource_id, url)
    );
    INSERT OR REPLACE INTO artifacts (resource_id, version, platform, arch, format, filename, url, size, mtime, crawled_at)
      SELECT resource_id, version, platform, arch, format, filename, url, size, mtime, crawled_at FROM artifacts_legacy;
    DROP TABLE artifacts_legacy;
    CREATE INDEX IF NOT EXISTS idx_artifacts_resource ON artifacts (resource_id, version);
  `);
}

function ensureColumn(
  db: DatabaseSyncType,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{
    name: string;
  }>;
  if (columns.some((entry) => entry.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
