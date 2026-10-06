import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync as Database } from 'node:sqlite';
import {
  CreateCuratedSchema,
  type ContentState,
  type CuratedDocument,
  type CuratedRecord,
  type CuratedSummary,
} from '@mirrorn/shared';
import { CurationError, parseDocument, publicationSnapshot } from './publication.js';
import type { Credential } from './auth.js';

const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');
interface Row {
  id: string;
  draft: string;
  published: string | null;
  revision: number;
  published_revision: number | null;
  state: ContentState;
  updated_at: number;
  published_at: number | null;
}

/** 人工内容与自动采集隔离。编辑保存和发布均使用修订号防止覆盖另一窗口的修改。 */
export class CurationStore {
  private readonly db: Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS curated_ecosystems (
        id TEXT PRIMARY KEY, draft TEXT NOT NULL, published TEXT,
        revision INTEGER NOT NULL, published_revision INTEGER,
        state TEXT NOT NULL CHECK(state IN ('draft','published','disabled')),
        updated_at INTEGER NOT NULL, published_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS curated_admin (
        id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL,
        salt TEXT NOT NULL, digest TEXT NOT NULL
      );`);
  }
  close() {
    this.db.close();
  }
  private row(id: string): Row {
    const row = this.db
      .prepare('SELECT * FROM curated_ecosystems WHERE id=?')
      .get(id) as unknown as Row | undefined;
    if (!row) throw new CurationError('没有这个生态', 404);
    return row;
  }
  private record(row: Row): CuratedRecord {
    return {
      document: parseDocument(JSON.parse(row.draft)),
      revision: row.revision,
      publishedRevision: row.published_revision,
      state: row.state,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
    };
  }
  get(id: string) {
    return this.record(this.row(id));
  }
  list() {
    return (
      this.db
        .prepare('SELECT * FROM curated_ecosystems ORDER BY updated_at DESC,id')
        .all() as unknown as Row[]
    ).map((row) => {
      const record = this.record(row);
      return {
        id: row.id,
        name: record.document.name,
        summary: record.document.summary,
        state: row.state,
        revision: row.revision,
        publishedRevision: row.published_revision,
        updatedAt: row.updated_at,
      };
    });
  }
  create(input: unknown): CuratedRecord {
    const parsed = CreateCuratedSchema.safeParse(input);
    if (!parsed.success) throw new CurationError('生态标识或名称不符合要求');
    if (this.db.prepare('SELECT id FROM curated_ecosystems WHERE id=?').get(parsed.data.id))
      throw new CurationError('生态标识已存在', 409);
    const doc = parseDocument(parsed.data);
    this.db
      .prepare(
        "INSERT INTO curated_ecosystems(id,draft,revision,state,updated_at) VALUES(?,?,1,'draft',?)",
      )
      .run(doc.id, JSON.stringify(doc), Date.now());
    return this.get(doc.id);
  }
  save(id: string, revision: number, raw: unknown): CuratedRecord {
    const doc = parseDocument(raw);
    if (doc.id !== id) throw new CurationError('生态标识创建后不能修改');
    const result = this.db
      .prepare(
        'UPDATE curated_ecosystems SET draft=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',
      )
      .run(JSON.stringify(doc), Date.now(), id, revision);
    if (!result.changes) {
      this.row(id);
      throw new CurationError('内容已被其他窗口修改，请重新加载后再编辑', 409);
    }
    return this.get(id);
  }
  preview(id: string) {
    return publicationSnapshot(this.get(id).document);
  }
  publish(id: string, revision: number, state: 'published' | 'disabled'): CuratedRecord {
    const row = this.row(id);
    if (row.revision !== revision) throw new CurationError('内容已变更，请重新加载后再发布', 409);
    const snapshot = state === 'published' ? this.preview(id) : undefined;
    for (const dep of snapshot?.dependencies ?? []) {
      if (dep.targetEcosystemId && !this.publicGet(dep.targetEcosystemId))
        throw new CurationError(`依赖 ${dep.name} 引用的生态尚未发布`);
    }
    const result = this.db
      .prepare(
        `UPDATE curated_ecosystems SET published=?,state=?,revision=revision+1,
      published_revision=?,published_at=?,updated_at=? WHERE id=? AND revision=?`,
      )
      .run(
        snapshot ? JSON.stringify(snapshot) : row.published,
        state,
        snapshot ? revision + 1 : row.published_revision,
        snapshot ? Date.now() : row.published_at,
        Date.now(),
        id,
        revision,
      );
    if (!result.changes) throw new CurationError('内容已变更，请重新加载后再发布', 409);
    return this.get(id);
  }
  publicGet(id: string): CuratedDocument | undefined {
    const row = this.db
      .prepare("SELECT published FROM curated_ecosystems WHERE id=? AND state='published'")
      .get(id) as { published: string | null } | undefined;
    return row?.published ? parseDocument(JSON.parse(row.published)) : undefined;
  }
  publicList(query = ''): CuratedSummary[] {
    const needle = query.trim().toLocaleLowerCase();
    const rows = this.db
      .prepare("SELECT * FROM curated_ecosystems WHERE state='published' ORDER BY id")
      .all() as unknown as Row[];
    return rows.flatMap((row) => {
      if (!row.published) return [];
      const doc = parseDocument(JSON.parse(row.published));
      const terms = [
        doc.id,
        doc.name,
        ...doc.aliases,
        ...doc.components.map((component) => component.name),
      ];
      if (needle && !terms.some((term) => term.toLocaleLowerCase().includes(needle))) return [];
      return [
        {
          id: doc.id,
          name: doc.name,
          summary: doc.summary,
          category: doc.category,
          aliases: doc.aliases,
          componentCount: doc.components.length,
          versionCount: doc.versions.length,
          publishedAt: row.published_at ?? row.updated_at,
        },
      ];
    });
  }
  credential(): Credential | undefined {
    return this.db.prepare('SELECT username,salt,digest FROM curated_admin WHERE id=1').get() as
      Credential | undefined;
  }
  setCredential(credential: Credential) {
    this.db
      .prepare(
        `INSERT INTO curated_admin(id,username,salt,digest) VALUES(1,?,?,?)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username,salt=excluded.salt,digest=excluded.digest`,
      )
      .run(credential.username, credential.salt, credential.digest);
  }
  export() {
    const rows = this.db
      .prepare('SELECT * FROM curated_ecosystems ORDER BY id')
      .all() as unknown as Row[];
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      ecosystems: rows.map((row) => ({
        ...this.record(row),
        published: row.published ? parseDocument(JSON.parse(row.published)) : null,
      })),
    };
  }
  backup(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    // SQLite自身创建一致性快照，包含已提交的WAL内容；拒绝覆盖已有备份文件。
    this.db.prepare('VACUUM INTO ?').run(path);
  }
}
