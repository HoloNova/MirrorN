import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ENABLED_RESOURCE_SITE, normalizePythonName } from '../indexing/policy.js';
import { compareRepoVersions } from '../indexing/versions.js';

export interface FileQuery {
  resource: string;
  q?: string;
  package?: string;
  version?: string;
  release?: string;
  arch?: string;
  platform?: string;
  role?: string;
  format?: string;
  cursor?: string;
  limit?: number;
}
export class FileQueryError extends Error {}
interface FileRow {
  id: number;
  snapshot_id: string;
  packageName: string;
  version: string;
  platform: string;
  arch: string;
  format: string;
  filename: string;
  url: string;
  size: number | null;
  role: string;
  checksum: string | null;
  compatibility: string;
  mtime: string | null;
  release: string;
  component: string;
  occurrence: number;
}
interface Cursor {
  frontier: number;
  after: number;
  at: number;
  fingerprint: string;
}

/** 游标锁定有效批次，更新切换时不会混入另一批次。所有参数为查询条件，绝不触发后台任务。 */
export function queryFiles(db: DatabaseSync, input: FileQuery, now = Date.now()) {
  if (!input.resource.startsWith(`${ENABLED_RESOURCE_SITE}:`))
    throw new FileQueryError('资源站点未启用');
  const limit = Math.min(200, Math.max(1, input.limit ?? 50));
  const filters = [
    input.resource,
    input.q ?? '',
    input.package ?? '',
    input.version ?? '',
    input.release ?? '',
    input.arch ?? '',
    input.platform ?? '',
    input.role ?? '',
    input.format ?? '',
  ];
  const fingerprint = createHash('sha256').update(JSON.stringify(filters)).digest('hex');
  let cursor: Cursor;
  if (input.cursor) {
    try {
      if (input.cursor.length > 2048) throw new Error();
      cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')) as Cursor;
      if (
        !Number.isSafeInteger(cursor.frontier) ||
        cursor.frontier < 0 ||
        !Number.isSafeInteger(cursor.after) ||
        !Number.isSafeInteger(cursor.at) ||
        cursor.at > now ||
        now - cursor.at > 60 * 60 * 1000 ||
        cursor.fingerprint !== fingerprint
      )
        throw new Error();
    } catch {
      throw new FileQueryError('分页游标无效或过期，请重新查询');
    }
  } else {
    const { frontier } = db
      .prepare('SELECT COALESCE(MAX(publication_seq),0) AS frontier FROM snapshots')
      .get() as { frontier: number };
    cursor = { frontier, after: Number.MIN_SAFE_INTEGER, at: now, fingerprint };
  }
  const snapshotClause = `n.publication_seq <= ? AND n.state IN ('active','replaced') AND s.resource_id=?
    AND NOT EXISTS (SELECT 1 FROM snapshots newer WHERE newer.scope_id=n.scope_id
      AND newer.publication_seq<=? AND newer.publication_seq>n.publication_seq)`;
  const sql = `WITH available AS (
    SELECT f.id, f.snapshot_id, f.package_name AS packageName, f.version, f.platform, f.arch, f.format,
      f.filename, f.url, f.size, f.role, f.checksum, f.compatibility, f.mtime, s.release, s.component
    FROM crawl_scopes s CROSS JOIN snapshots n ON n.scope_id=s.id CROSS JOIN files f ON f.snapshot_id=n.id
    WHERE ${snapshotClause}
    UNION ALL
    SELECT -a.rowid, 'legacy', '' AS packageName,a.version,a.platform,a.arch,a.format,a.filename,a.url,a.size,
      CASE r.kind WHEN 'installer' THEN 'installer' WHEN 'iso' THEN 'iso' ELSE 'firmware' END,
      NULL,'{}',a.mtime,'','' FROM artifacts a JOIN resources r ON r.id=a.resource_id
    WHERE a.resource_id=? AND r.kind<>'dataset' AND NOT EXISTS (
      SELECT 1 FROM snapshots n JOIN crawl_scopes s ON s.id=n.scope_id WHERE ${snapshotClause}
      AND substr(a.url,1,length(s.base_url))=s.base_url AND instr(substr(a.url,length(s.base_url)+1),'/')=0
    )
  )`;
  const params: (string | number)[] = [
    cursor.frontier,
    input.resource,
    cursor.frontier,
    input.resource,
    cursor.frontier,
    input.resource,
    cursor.frontier,
  ];
  const clauses: string[] = [];
  if (input.q?.trim()) {
    const query = input.q
      .trim()
      .slice(0, 200)
      .replace(/[\\%_]/g, '\\$&');
    clauses.push("(packageName LIKE ? ESCAPE '\\' OR filename LIKE ? ESCAPE '\\')");
    const packageQuery = packageInput(db, input.resource, input.q.trim().slice(0, 200))?.replace(
      /[\\%_]/g,
      '\\$&',
    );
    params.push(`${packageQuery}%`, `${query}%`);
  }
  for (const [column, value] of [
    ['packageName', packageInput(db, input.resource, input.package)],
    ['version', input.version],
    ['release', input.release],
    ['arch', undefined],
    ['platform', undefined],
    ['role', input.role],
    ['format', input.format],
  ]) {
    if (value) {
      clauses.push(`${column}=?`);
      params.push(value);
    }
  }
  if (input.platform) {
    clauses.push("platform IN (?, 'any', 'unknown')");
    params.push(input.platform);
  }
  if (input.arch) {
    clauses.push("arch IN (?, 'all', 'noarch', 'any', 'unknown')");
    params.push(input.arch);
  }
  const rows = db
    .prepare(
      `${sql}, unique_files AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY url,packageName,version ORDER BY id DESC) AS occurrence
      FROM available WHERE ${clauses.length ? clauses.join(' AND ') : '1=1'})
      SELECT * FROM unique_files WHERE occurrence=1 AND id>? ORDER BY id LIMIT ?`,
    )
    .all(...params, cursor.after, limit + 1) as unknown as FileRow[];
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  return {
    items: selected.map((row) => ({
      id: row.id,
      packageName: row.packageName,
      version: row.version,
      platform: row.platform,
      arch: row.arch,
      format: row.format,
      filename: row.filename,
      url: row.url,
      role: row.role,
      release: row.release,
      component: row.component,
      size: row.size ?? undefined,
      mtime: row.mtime ?? undefined,
      checksum: row.checksum ? (JSON.parse(String(row.checksum)) as unknown) : undefined,
      compatibility: JSON.parse(String(row.compatibility)) as unknown,
    })),
    nextCursor: hasMore
      ? Buffer.from(JSON.stringify({ ...cursor, after: Number(selected.at(-1)!.id) })).toString(
          'base64url',
        )
      : null,
    indexedAt: cursor.at,
  };
}

export function queryFileOptions(db: DatabaseSync, input: FileQuery) {
  if (!input.resource.startsWith('pku:')) throw new FileQueryError('资源站点未启用');
  const clauses = ['resource_id=?'];
  const args: (string | number)[] = [input.resource];
  for (const [key, value] of [
    ['package_name', packageInput(db, input.resource, input.package)],
    ['release', input.release],
    ['arch', undefined],
  ])
    if (value) {
      clauses.push(`${key}=?`);
      args.push(value);
    }
  if (input.platform) {
    clauses.push("platform IN (?, 'any', 'unknown')");
    args.push(input.platform);
  }
  if (input.arch) {
    clauses.push("arch IN (?, 'all', 'noarch', 'any', 'unknown')");
    args.push(input.arch);
  }
  if (input.q?.trim()) {
    const value = input.q
      .trim()
      .slice(0, 200)
      .replace(/[\\%_]/g, '\\$&');
    clauses.push("(package_name LIKE ? ESCAPE '\\' OR filename LIKE ? ESCAPE '\\')");
    args.push(`${value}%`, `${value}%`);
  }
  const where = clauses.join(' AND ');
  const distinct = (column: string) =>
    (
      db
        .prepare(
          `SELECT DISTINCT ${column} AS value FROM effective_files WHERE ${where} ORDER BY ${column}`,
        )
        .all(...args) as { value: string }[]
    ).map((row) => row.value);
  const resource = db
    .prepare('SELECT kind,repo_id FROM resources WHERE id=?')
    .get(input.resource) as { kind: string; repo_id: string } | undefined;
  // 不把不同包的版本混成一个下拉；依赖包必须先限定包名。
  let versions: string[] = [];
  if (input.package) versions = distinct('version');
  else if (resource && !['distro-repo', 'language-repo'].includes(resource.kind)) {
    const softwareWhere = `${where} AND role IN ('installer','iso','firmware')`;
    const groups = db
      .prepare(`SELECT DISTINCT package_name FROM effective_files WHERE ${softwareWhere} LIMIT 2`)
      .all(...args);
    if (groups.length === 1)
      versions = (
        db
          .prepare(`SELECT DISTINCT version AS value FROM effective_files WHERE ${softwareWhere}`)
          .all(...args) as { value: string }[]
      ).map((row) => row.value);
  }
  versions.sort((a, b) => compareRepoVersions(resource?.repo_id ?? '', b, a));
  return {
    platforms: distinct('platform'),
    arches: distinct('arch'),
    versions,
    releases: distinct('release'),
    roles: distinct('role'),
  };
}

function packageInput(db: DatabaseSync, resource: string, value?: string) {
  if (!value?.trim()) return undefined;
  const repo = db.prepare('SELECT repo_id FROM resources WHERE id=?').get(resource) as
    { repo_id: string } | undefined;
  return repo?.repo_id === 'pypi' ? normalizePythonName(value.trim()) : value.trim();
}
