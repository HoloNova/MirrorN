import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
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
export class FileQueryError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 = 400,
  ) {
    super(message);
  }
}
interface Row {
  id: number;
  rank: number;
  filename: string;
  url: string;
  platform: string;
  arch: string;
  format: string;
  size: number | null;
  checksum: string | null;
  crawled_at: number;
  version: string;
  slug: string;
}
interface Cursor {
  revision: number;
  after: number;
  rank: number;
  at: number;
  fingerprint: string;
}
const PREFERENCE =
  "CASE d.format WHEN 'msi' THEN 0 WHEN 'pkg' THEN 0 WHEN 'exe' THEN 1 WHEN 'dmg' THEN 1 WHEN 'sh' THEN 2 WHEN 'AppImage' THEN 2 WHEN 'zip' THEN 4 ELSE 3 END";
const FROM = `FROM catalog_software w JOIN catalog_versions v ON v.software_id=w.id
  JOIN catalog_downloads d ON d.version_id=v.id JOIN catalog_sites s ON s.id=d.site_id`;
function conditions(input: FileQuery) {
  const [site, ...parts] = input.resource.split(':');
  if (site !== 'pku') throw new FileQueryError('资源站点未启用');
  const clauses = ['s.slug=?', 'w.resource_key=?'];
  const params: (string | number)[] = [site, parts.join(':')];
  if (input.version) {
    clauses.push('(v.version=? OR v.version=?)');
    params.push(
      input.version,
      input.version.startsWith('v') ? input.version.slice(1) : `v${input.version}`,
    );
  }
  for (const [column, value] of [
    ['d.platform', input.platform],
    ['d.arch', input.arch],
  ]) {
    if (value) {
      clauses.push(`${column} IN (?,'any','unknown')`);
      params.push(value);
    }
  }
  if (input.format) {
    clauses.push('d.format=?');
    params.push(input.format);
  }
  if (input.role && input.role !== 'installer') clauses.push('0');
  if (input.release) clauses.push('0'); // 不再把发行版包仓库混入软件安装目录。
  if (input.package) {
    clauses.push('(w.slug=? OR w.name=?)');
    params.push(input.package, input.package);
  }
  if (input.q?.trim()) {
    const query = input.q
      .trim()
      .slice(0, 200)
      .replace(/[\\%_]/g, '\\$&');
    clauses.push("(d.filename LIKE ? ESCAPE '\\' OR w.name LIKE ? ESCAPE '\\')");
    params.push(`${query}%`, `${query}%`);
  }
  return { where: clauses.join(' AND '), params, site, key: parts.join(':') };
}

/** 更新后提示重新读取分页，不为旧游标复制并保留整批下载数据。 */
export function queryFiles(db: DatabaseSync, input: FileQuery, now = Date.now()) {
  const filter = conditions(input);
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        input.resource,
        input.q ?? '',
        input.package ?? '',
        input.version ?? '',
        input.release ?? '',
        input.arch ?? '',
        input.platform ?? '',
        input.role ?? '',
        input.format ?? '',
      ]),
    )
    .digest('hex');
  const limit = Math.min(200, Math.max(1, input.limit ?? 50));
  db.exec('BEGIN');
  try {
    const revision = (
      db
        .prepare(
          `SELECT COALESCE(SUM(c.revision),0)+COUNT(*) revision FROM catalog_scopes c
      JOIN catalog_software w ON w.id=c.software_id JOIN catalog_sites s ON s.id=c.site_id WHERE s.slug=? AND w.resource_key=?`,
        )
        .get(filter.site, filter.key) as { revision: number }
    ).revision;
    let cursor: Cursor = { revision, after: 0, rank: -1, at: now, fingerprint };
    if (input.cursor) {
      try {
        if (input.cursor.length > 2048) throw new Error();
        cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')) as Cursor;
        if (
          !Number.isSafeInteger(cursor.after) ||
          cursor.after < 0 ||
          !Number.isSafeInteger(cursor.rank) ||
          cursor.rank < 0 ||
          cursor.rank > 4 ||
          !Number.isSafeInteger(cursor.revision) ||
          !Number.isSafeInteger(cursor.at) ||
          cursor.at > now ||
          now - cursor.at > 3600000 ||
          cursor.fingerprint !== fingerprint
        )
          throw new Error();
      } catch {
        throw new FileQueryError('分页游标无效或过期，请重新查询');
      }
      if (cursor.revision !== revision) throw new FileQueryError('文件清单已更新，请重新查询', 409);
    }
    const rows = db
      .prepare(
        `SELECT d.id,${PREFERENCE} rank,d.filename,d.url,d.platform,d.arch,d.format,d.size,d.checksum,d.crawled_at,v.version,w.slug
      ${FROM} WHERE ${filter.where} AND (${PREFERENCE}>? OR (${PREFERENCE}=? AND d.id>?)) ORDER BY rank,d.id LIMIT ?`,
      )
      .all(...filter.params, cursor.rank, cursor.rank, cursor.after, limit + 1) as unknown as Row[];
    const selected = rows.slice(0, limit);
    return {
      items: selected.map((row) => ({
        id: row.id,
        packageName: row.slug,
        version: row.version,
        filename: row.filename,
        url: row.url,
        platform: row.platform,
        arch: row.arch,
        format: row.format,
        role: 'installer',
        release: '',
        component: '',
        ...(row.size === null ? {} : { size: row.size }),
        ...(row.checksum ? { checksum: JSON.parse(row.checksum) as unknown } : {}),
        compatibility: {},
      })),
      nextCursor:
        rows.length > limit
          ? Buffer.from(
              JSON.stringify({
                ...cursor,
                after: selected.at(-1)!.id,
                rank: selected.at(-1)!.rank,
              }),
            ).toString('base64url')
          : null,
      indexedAt: cursor.at,
    };
  } finally {
    db.exec('ROLLBACK');
  }
}

export function queryFileOptions(db: DatabaseSync, input: FileQuery) {
  const filter = conditions({ ...input, version: undefined });
  const rows = db
    .prepare(`SELECT DISTINCT d.platform,d.arch,v.version ${FROM} WHERE ${filter.where}`)
    .all(...filter.params) as { platform: string; arch: string; version: string }[];
  const repo = db
    .prepare('SELECT repo FROM catalog_software WHERE resource_key=?')
    .get(filter.key) as { repo: string } | undefined;
  const platforms = [
    ...new Set(
      rows.flatMap((r) => (r.platform === 'any' ? ['windows', 'macos', 'linux'] : [r.platform])),
    ),
  ].sort();
  return {
    platforms,
    arches: [...new Set(rows.map((r) => r.arch))].sort(),
    versions: [...new Set(rows.map((r) => r.version))].sort((a, b) =>
      compareRepoVersions(repo?.repo ?? '', b, a),
    ),
    releases: [],
    roles: rows.length ? ['installer'] : [],
  };
}
