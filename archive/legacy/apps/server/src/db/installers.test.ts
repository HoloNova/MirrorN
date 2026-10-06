import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexFixture, fixtureDownload, fixtureRun, nodeDirectory } from './indexFixture.js';
import { beginRun, stageDownloads, publishRun, failRun, recoverRuns } from './installers.js';
import { openReadDatabase } from './database.js';
import { queryFiles } from './fileQueries.js';
import { searchResources, listSites, listEcosystems } from './catalog.js';

const count = (db: ReturnType<typeof indexFixture>, table: string) =>
  (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;
describe('精简安装目录：安全更新与去重', () => {
  it('采集中旧数据持续可读，失败即清暂存；只读连接不见未发布数据', () => {
    const dir = mkdtempSync(join(tmpdir(), 'installer-db-'));
    const writer = indexFixture(join(dir, 'db.sqlite'));
    fixtureRun(writer);
    const reader = openReadDatabase(join(dir, 'db.sqlite'));
    try {
      const run = beginRun(writer, 'pku', 'nodejs', nodeDirectory, Date.now());
      stageDownloads(writer, run, [fixtureDownload('new.msi')]);
      expect(queryFiles(reader, { resource: 'pku:nodejs-release' }).items[0]?.filename).toBe(
        fixtureDownload().filename,
      );
      failRun(writer, run, '解析末尾失败');
      expect(count(writer, 'catalog_staged')).toBe(0);
      expect(count(writer, 'catalog_downloads')).toBe(1);
      expect(() => reader.exec('DELETE FROM catalog_downloads')).toThrow();
    } finally {
      reader.close();
      writer.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('重复采集不复制版本或文件，大小更新也保持同一下载ID', () => {
    const db = indexFixture();
    try {
      fixtureRun(db, [fixtureDownload()], 1);
      const before = queryFiles(db, { resource: 'pku:nodejs-release' }).items[0]!.id;
      for (let epoch = 2; epoch < 8; epoch++)
        fixtureRun(db, [{ ...fixtureDownload(), size: epoch }], epoch);
      expect(count(db, 'catalog_versions')).toBe(1);
      expect(count(db, 'catalog_downloads')).toBe(1);
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items[0]).toMatchObject({
        id: before,
        size: 7,
      });
      expect(count(db, 'catalog_staged')).toBe(0);
    } finally {
      db.close();
    }
  });
  it('完整成功删除缺项，不影响其它目录；空/异常减少不能清空旧数据', () => {
    const db = indexFixture();
    try {
      fixtureRun(db, [fixtureDownload('a.msi'), fixtureDownload('b.msi')], 1);
      const other = 'https://mirrors.pku.edu.cn/nodejs-release/v22.0.0/';
      fixtureRun(db, [{ ...fixtureDownload('c.msi', 'v22.0.0'), url: `${other}c.msi` }], 1, other);
      fixtureRun(db, [fixtureDownload('a.msi')], 2);
      expect(count(db, 'catalog_downloads')).toBe(2);
      const empty = beginRun(db, 'pku', 'nodejs', nodeDirectory, 3);
      expect(() => publishRun(db, empty)).toThrow('异常空');
      failRun(db, empty, 'empty');
      expect(count(db, 'catalog_downloads')).toBe(2);
    } finally {
      db.close();
    }
  });
  it('较早重试不能回滚已更新结果，失败保留新版', () => {
    const db = indexFixture();
    try {
      const old = beginRun(db, 'pku', 'nodejs', nodeDirectory, 1);
      stageDownloads(db, old, [fixtureDownload('old.msi')]);
      fixtureRun(db, [fixtureDownload('new.msi')], 2);
      expect(() => publishRun(db, old)).toThrow('旧采集');
      failRun(db, old, 'stale');
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items[0]?.filename).toBe('new.msi');
    } finally {
      db.close();
    }
  });
  it('父目录完整撤销版本时清除该子范围，旧待办不能重新复活文件', () => {
    const db = indexFixture(),
      root = 'https://mirrors.pku.edu.cn/nodejs-release/';
    try {
      const parent = beginRun(db, 'pku', 'nodejs', root, 1);
      publishRun(db, parent, Date.now(), [nodeDirectory]);
      fixtureRun(db, [fixtureDownload()], 1);
      const stale = beginRun(db, 'pku', 'nodejs', nodeDirectory, 1);
      stageDownloads(db, stale, [fixtureDownload()]);
      const next = beginRun(db, 'pku', 'nodejs', root, 2);
      publishRun(db, next, Date.now(), []);
      expect(count(db, 'catalog_downloads')).toBe(0);
      expect(() => publishRun(db, stale)).toThrow('旧采集');
      failRun(db, stale, '撤销');
      expect(() => beginRun(db, 'pku', 'nodejs', nodeDirectory, 1)).toThrow('目录已撤销');
      const back = beginRun(db, 'pku', 'nodejs', root, 3);
      publishRun(db, back, Date.now(), [nodeDirectory]);
      fixtureRun(db, [fixtureDownload()], 3);
      expect(count(db, 'catalog_downloads')).toBe(1);
    } finally {
      db.close();
    }
  });
  it('进程中断的暂存立即回收，不动有效文件', () => {
    const db = indexFixture();
    try {
      fixtureRun(db);
      const run = beginRun(db, 'pku', 'nodejs', nodeDirectory, Date.now());
      stageDownloads(db, run, [fixtureDownload('unfinished.msi')]);
      recoverRuns(db);
      expect(count(db, 'catalog_staged')).toBe(0);
      expect(count(db, 'catalog_downloads')).toBe(1);
    } finally {
      db.close();
    }
  });
  it('同文件名不同URL不误合并，跨软件版本只通过整数关联', () => {
    const db = indexFixture();
    try {
      fixtureRun(db, [fixtureDownload('same.msi')]);
      const dir = 'https://mirrors.pku.edu.cn/nodejs-release/v22.0.0/';
      fixtureRun(
        db,
        [{ ...fixtureDownload('same.msi', 'v22.0.0'), url: `${dir}same.msi` }],
        Date.now(),
        dir,
      );
      expect(count(db, 'catalog_versions')).toBe(2);
      expect(count(db, 'catalog_downloads')).toBe(2);
      const columns = db.prepare('PRAGMA table_info(catalog_downloads)').all() as {
        name: string;
        type: string;
      }[];
      expect(columns.find((c) => c.name === 'version_id')?.type).toBe('INTEGER');
      expect(columns.map((c) => c.name)).not.toContain('snapshot_id');
    } finally {
      db.close();
    }
  });
  it('拒绝其它站点/目录链接和无效文件，事务不留下半份数据', () => {
    const db = indexFixture();
    try {
      expect(() => beginRun(db, 'ustc', 'nodejs', nodeDirectory, 1)).toThrow('未启用');
      expect(() =>
        beginRun(db, 'ustc', 'nodejs', 'https://mirrors.ustc.edu.cn/node/v24.1.0/', 1),
      ).toThrow('未启用');
      expect(() => beginRun(db, 'unverified', 'nodejs', nodeDirectory, 1)).toThrow('未启用');
      const run = beginRun(db, 'pku', 'nodejs', nodeDirectory, 1);
      expect(() =>
        stageDownloads(db, run, [
          fixtureDownload(),
          { ...fixtureDownload('wrong.msi'), url: 'https://example.com/wrong.msi' },
        ]),
      ).toThrow();
      expect(count(db, 'catalog_staged')).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe('查询围绕生态、版本和站点关系', () => {
  it('生态＋版本搜索、站点与生态统计来自有效下载，空条目不冒充下载', () => {
    const db = indexFixture();
    try {
      expect(searchResources(db, { downloadableOnly: true })).toEqual([]);
      expect(searchResources(db)).toEqual([]);
      expect(
        searchResources(db, { downloadableOnly: false }).every(
          (r) => r.downloadMode === 'unavailable',
        ),
      ).toBe(true);
      fixtureRun(db);
      expect(searchResources(db, { query: 'node 24.1.0' }).map((r) => r.id)).toEqual([
        'pku:nodejs-release',
      ]);
      expect(searchResources(db, { ecosystemId: 'nodejs', version: '24.1.0' })).toHaveLength(1);
      expect(searchResources(db, { query: 'node 22.0.0' })).toHaveLength(0);
      expect(searchResources(db, { query: "' OR 1=1 --" })).toHaveLength(0);
      expect(searchResources(db, { query: '%' })).toHaveLength(0);
      expect(searchResources(db, { siteId: 'ustc' })).toHaveLength(0);
      expect(listSites(db).find((s) => s.id === 'pku')?.resourceCount).toBe(1);
      expect(listSites(db).find((s) => s.id === 'ustc')?.enabled).toBe(false);
      expect(listEcosystems(db).map((e) => e.id)).toContain('nodejs');
      expect(listEcosystems(db).some((e) => e.id === 'epel')).toBe(false);
    } finally {
      db.close();
    }
  });
  it('分页稳定、不混更新；更新后明确要求重新查询而非保留整份历史', () => {
    const db = indexFixture();
    try {
      fixtureRun(db, [fixtureDownload('a.msi'), fixtureDownload('b.msi')], 1);
      const first = queryFiles(db, { resource: 'pku:nodejs-release', limit: 1 });
      expect(first.nextCursor).toBeTruthy();
      expect(
        queryFiles(db, { resource: 'pku:nodejs-release', limit: 1, cursor: first.nextCursor! })
          .items[0]?.filename,
      ).toBe('b.msi');
      fixtureRun(db, [fixtureDownload('a.msi'), fixtureDownload('c.msi')], 2);
      expect(() =>
        queryFiles(db, { resource: 'pku:nodejs-release', cursor: first.nextCursor! }),
      ).toThrow('清单已更新');
      expect(count(db, 'catalog_downloads')).toBe(2);
    } finally {
      db.close();
    }
  });
});

describe('安装器优先与分页', () => {
  it('同版本先列直接安装器而非ZIP，游标跨格式不会漏项或重复', () => {
    const db = indexFixture();
    try {
      fixtureRun(db, [
        { ...fixtureDownload('node-v24.1.0-win-x64.zip'), format: 'zip' },
        fixtureDownload(),
        { ...fixtureDownload('node-v24.1.0.exe'), format: 'exe' },
      ]);
      const first = queryFiles(db, { resource: 'pku:nodejs-release', limit: 1 });
      expect(first.items[0]?.format).toBe('msi');
      const second = queryFiles(db, {
        resource: 'pku:nodejs-release',
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect(second.items[0]?.format).toBe('exe');
      const third = queryFiles(db, {
        resource: 'pku:nodejs-release',
        limit: 1,
        cursor: second.nextCursor!,
      });
      expect(third.items[0]?.format).toBe('zip');
      expect(third.nextCursor).toBeNull();
    } finally {
      db.close();
    }
  });
});

// latest是镜像别名，Python2与Python3可能同时使用；不能按旧入库ID默认选已淘汰的Python2。
describe('Miniconda默认文件选择', () => {
  it('同版本优先Python3，Python2仍可通过文件名查询并分页读取', () => {
    const db = indexFixture();
    const directory = 'https://mirrors.pku.edu.cn/anaconda/miniconda/';
    const files = ['Miniconda2-latest-Linux-x86_64.sh', 'Miniconda3-latest-Linux-x86_64.sh'].map(
      (filename) => ({
        filename,
        version: 'latest',
        url: directory + filename,
        platform: 'linux' as const,
        arch: 'x64',
        format: 'sh',
        size: 100,
      }),
    );
    try {
      fixtureRun(db, files, 1, directory, 'anaconda-installer');
      const query = {
        resource: 'pku:anaconda',
        platform: 'linux',
        arch: 'x64',
        version: 'latest',
        limit: 1,
      };
      const page = queryFiles(db, query);
      expect(page.items[0]?.filename).toBe(files[1]!.filename);
      expect(queryFiles(db, { ...query, cursor: page.nextCursor! }).items[0]?.filename).toBe(
        files[0]!.filename,
      );
      expect(queryFiles(db, { ...query, q: 'Miniconda2' }).items[0]?.filename).toBe(
        files[0]!.filename,
      );
    } finally {
      db.close();
    }
  });
});
