import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { FileQueryError } from './fileQueries.js';

export interface CatalogItem {
  id: string;
  type: 'software' | 'ecosystem';
  name: string;
  ecosystemId: string;
  ecosystemLabel: string;
  kind: string;
  softwareCount: number;
  siteCount: number;
}
interface Identity {
  software_id: number;
  site_id: number;
  softwareId: string;
  resourceKey: string;
  name: string;
  aliases: string;
  ecosystemId: string;
  ecosystemLabel: string;
  ecosystemAliases: string;
  kind: string;
  siteId: string;
  siteName: string;
  sitePayload: string;
  artifactCount: number;
  downloadEntry: string | null;
}
interface Snapshot {
  token: string;
  revision: string;
  identities: Identity[];
  items: CatalogItem[];
  aliases: Map<string, string[]>;
}
const snapshots = new WeakMap<DatabaseSync, Snapshot>();

/** 这里只读身份及下载计数，不生成版本列表、不取文件元数据。后台仍是唯一写入者。
 * 固定软件→版本→下载的索引：默认规划会为每个软件重扫整站下载，生产实测约256ms→20ms。
 */
function snapshot(db: DatabaseSync): Snapshot {
  db.exec('SAVEPOINT discovery_read');
  try {
    const token = JSON.stringify([
      db.prepare('PRAGMA data_version').get(),
      db.prepare('SELECT total_changes() changes').get(),
    ]);
    const cached = snapshots.get(db);
    if (cached?.token === token) return cached;
    const identities = db
      .prepare(
        `SELECT w.id software_id,s.id site_id,w.slug softwareId,w.resource_key resourceKey,
    w.name,w.aliases,e.slug ecosystemId,e.label ecosystemLabel,e.aliases ecosystemAliases,w.kind,
    s.slug siteId,s.name siteName,s.payload sitePayload,
    (SELECT COUNT(*) FROM catalog_versions v JOIN catalog_downloads d INDEXED BY download_version_site ON d.version_id=v.id
      WHERE v.software_id=w.id AND d.site_id=s.id) artifactCount,
    (SELECT directory FROM catalog_scopes c WHERE c.software_id=w.id AND c.site_id=s.id AND c.enabled=1
      ORDER BY length(directory),directory LIMIT 1) downloadEntry
    FROM catalog_software w JOIN catalog_ecosystems e ON e.id=w.ecosystem_id
    JOIN catalog_software_sites ws ON ws.software_id=w.id JOIN catalog_sites s ON s.id=ws.site_id
    WHERE EXISTS(SELECT 1 FROM catalog_versions v JOIN catalog_downloads d INDEXED BY download_version_site ON d.version_id=v.id
      WHERE v.software_id=w.id AND d.site_id=s.id)
    ORDER BY w.name,w.slug,s.slug`,
      )
      .all() as unknown as Identity[];
    const software = new Map<string, CatalogItem>();
    const ecosystems = new Map<string, CatalogItem>();
    const aliases = new Map<string, string[]>();
    for (const row of identities) {
      const id = `software:${row.softwareId}`;
      const existing = software.get(row.softwareId);
      if (existing) existing.siteCount += 1;
      else {
        software.set(row.softwareId, {
          id: row.softwareId,
          type: 'software',
          name: row.name,
          ecosystemId: row.ecosystemId,
          ecosystemLabel: row.ecosystemLabel,
          kind: row.kind,
          softwareCount: 1,
          siteCount: 1,
        });
        aliases.set(id, JSON.parse(row.aliases) as string[]);
      }
    }
    for (const row of software.values()) {
      const existing = ecosystems.get(row.ecosystemId);
      if (existing) existing.softwareCount += 1;
      else {
        const identitiesForEco = identities.filter((r) => r.ecosystemId === row.ecosystemId);
        ecosystems.set(row.ecosystemId, {
          id: row.ecosystemId,
          type: 'ecosystem',
          name: row.ecosystemLabel,
          ecosystemId: row.ecosystemId,
          ecosystemLabel: row.ecosystemLabel,
          kind: 'ecosystem',
          softwareCount: 1,
          siteCount: new Set(identitiesForEco.map((r) => r.siteId)).size,
        });
        aliases.set(
          `ecosystem:${row.ecosystemId}`,
          JSON.parse(identitiesForEco[0]!.ecosystemAliases) as string[],
        );
      }
    }
    // Node.js 等同名生态与软件只留一个入口；生态的有效同义名仍可命中软件。
    const items = [...software.values()];
    for (const eco of ecosystems.values()) {
      const equivalent = items.find(
        (w) => w.ecosystemId === eco.id && normalize(w.name) === normalize(eco.name),
      );
      if (equivalent && eco.softwareCount === 1) {
        aliases.set(`software:${equivalent.id}`, [
          ...aliases.get(`software:${equivalent.id}`)!,
          ...aliases.get(`ecosystem:${eco.id}`)!,
        ]);
      } else items.push(eco);
    }
    // 目录没有展示文件版本或采集时点。相同清单的后台重核不能使目录续页持续409；
    // 只有身份、归属、可下载数量和来源等返回字段变化才使目录游标失效。
    const revision = createHash('sha256').update(JSON.stringify(identities)).digest('hex');
    const result = { token, revision, identities, items, aliases };
    snapshots.set(db, result);
    return result;
  } finally {
    db.exec('RELEASE discovery_read');
  }
}

export function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
    .replace(/[._\-\s]+/g, ' ');
}
function oneEdit(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length >= right.length) i += 1;
    if (right.length >= left.length) j += 1;
  }
  return edits + Number(i < left.length || j < right.length) <= 1;
}
/** 短词只准名称/同义名的完整词；不使用站点、版本、文件名和生态关联冒充软件别名。 */
export function matchScore(
  query: string,
  name: string,
  aliases: string[] = [],
): number | undefined {
  const q = normalize(query);
  const values = [name, ...aliases].map(normalize);
  if (values[0] === q) return 0;
  if (values.slice(1).includes(q)) return 1;
  const terms = q.split(/\s+/);
  const scores = terms.map((term) => {
    let score: number | undefined;
    for (const value of values) {
      const words = value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const candidate = words.includes(term)
        ? 2
        : term.length >= 4 &&
            (value.startsWith(term) || words.some((word) => word.startsWith(term)))
          ? 3
          : term.length >= 4 && value.includes(term)
            ? 4
            : term.length >= 5 && words.some((word) => oneEdit(term, word))
              ? 5
              : undefined;
      if (candidate !== undefined) score = Math.min(score ?? candidate, candidate);
    }
    return score;
  });
  return scores.some((score) => score === undefined)
    ? undefined
    : Math.max(...(scores as number[]));
}
interface PageOptions {
  query?: string;
  ecosystem?: string;
  site?: string;
  cursor?: string;
}
const PAGE_SIZE = 10;
function page<T>(rows: T[], revision: string, options: PageOptions, now: number) {
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([normalize(options.query ?? ''), options.ecosystem ?? '', options.site ?? '']),
    )
    .digest('hex');
  let offset = 0;
  let at = now;
  if (options.cursor) {
    let cursor: { offset: number; at: number; revision: string; fingerprint: string };
    try {
      if (options.cursor.length > 2048) throw new Error();
      cursor = JSON.parse(
        Buffer.from(options.cursor, 'base64url').toString('utf8'),
      ) as typeof cursor;
      if (
        !Number.isSafeInteger(cursor.offset) ||
        cursor.offset < 0 ||
        !Number.isSafeInteger(cursor.at) ||
        cursor.at > now ||
        now - cursor.at > 3600000 ||
        cursor.fingerprint !== fingerprint ||
        typeof cursor.revision !== 'string'
      )
        throw new Error();
    } catch {
      throw new FileQueryError('分页游标无效或过期，请重新查询');
    }
    if (cursor.revision !== revision) throw new FileQueryError('资源目录已更新，请重新查询', 409);
    offset = cursor.offset;
    at = cursor.at;
  }
  return {
    items: rows.slice(offset, offset + PAGE_SIZE),
    nextCursor:
      rows.length > offset + PAGE_SIZE
        ? Buffer.from(
            JSON.stringify({
              offset: offset + PAGE_SIZE,
              at,
              revision,
              fingerprint,
            }),
          ).toString('base64url')
        : null,
    total: rows.length,
  };
}
export function searchCatalog(db: DatabaseSync, options: PageOptions = {}, now = Date.now()) {
  const data = snapshot(db);
  const query = options.query?.trim().slice(0, 200) ?? '';
  if (!query && !options.ecosystem) return page([], data.revision, options, now);
  const rows = data.items
    .filter(
      (item) =>
        !options.ecosystem || (item.type === 'software' && item.ecosystemId === options.ecosystem),
    )
    .map((item) => ({
      item,
      score: query ? matchScore(query, item.name, data.aliases.get(`${item.type}:${item.id}`)) : 0,
    }))
    .filter((r) => r.score !== undefined)
    .sort(
      (a, b) =>
        a.score! - b.score! ||
        a.item.name.localeCompare(b.item.name) ||
        a.item.id.localeCompare(b.item.id),
    )
    .map((r) => r.item);
  return page(rows, data.revision, options, now);
}
export function siteCatalog(db: DatabaseSync, options: PageOptions, now = Date.now()) {
  const data = snapshot(db);
  const query = options.query?.trim().slice(0, 200) ?? '';
  const rows = data.identities
    .filter((r) => r.siteId === options.site)
    .map((row) => ({
      row,
      score: query
        ? matchScore(query, row.name, [
            ...data.aliases.get(`software:${row.softwareId}`)!,
            row.ecosystemLabel,
            ...(JSON.parse(row.ecosystemAliases) as string[]),
          ])
        : 0,
    }))
    .filter((r) => r.score !== undefined)
    .sort(
      (a, b) =>
        a.score! - b.score! ||
        a.row.name.localeCompare(b.row.name) ||
        a.row.softwareId.localeCompare(b.row.softwareId),
    )
    .map(({ row }) => ({
      id: `${row.siteId}:${row.resourceKey}`,
      softwareId: row.softwareId,
      name: row.name,
      ecosystemLabel: row.ecosystemLabel,
      kind: row.kind,
      artifactCount: row.artifactCount,
    }));
  return page(rows, data.revision, options, now);
}
// 来源位置按实际下载主机核实，不把 official/university 等性质当作地理位置。
export function downloadRegion(entry: string): 'CN' | 'unknown' {
  return new URL(entry).hostname === 'mirrors.pku.edu.cn' ? 'CN' : 'unknown';
}
export function softwareCatalog(db: DatabaseSync, softwareId: string) {
  const rows = snapshot(db).identities.filter((row) => row.softwareId === softwareId);
  if (!rows.length) return undefined;
  const first = rows[0]!;
  return {
    id: softwareId,
    name: first.name,
    ecosystemId: first.ecosystemId,
    ecosystemLabel: first.ecosystemLabel,
    kind: first.kind,
    candidates: rows
      .filter((row) => row.downloadEntry)
      .map((row) => {
        const mirror = JSON.parse(row.sitePayload) as { probe?: unknown };
        return {
          id: `${row.siteId}:${row.resourceKey}`,
          siteId: row.siteId,
          siteName: row.siteName,
          downloadEntry: row.downloadEntry!,
          region: downloadRegion(row.downloadEntry!),
          artifactCount: row.artifactCount,
          ...(mirror.probe ? { probe: mirror.probe } : {}),
        };
      }),
  };
}
export function resourceSoftware(db: DatabaseSync, resourceId: string): string | undefined {
  const [site, ...key] = resourceId.split(':');
  return snapshot(db).identities.find(
    (row) => row.siteId === site && row.resourceKey === key.join(':'),
  )?.softwareId;
}
export function ecosystemCatalog(db: DatabaseSync, id: string) {
  const rows = snapshot(db).identities.filter((r) => r.ecosystemId === id);
  return rows.length
    ? {
        id,
        name: rows[0]!.ecosystemLabel,
        softwareCount: new Set(rows.map((r) => r.softwareId)).size,
      }
    : undefined;
}
