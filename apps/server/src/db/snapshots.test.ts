import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { openReadDatabase } from './database.js';
import {
  beginSnapshot,
  stageFiles,
  publishSnapshot,
  rejectSnapshot,
  collectOldSnapshots,
} from './snapshots.js';
import { queryFileOptions, queryFiles } from './fileQueries.js';
import { indexFixture, aptScope, fixtureFile, fixtureSnapshot } from './indexFixture.js';

const names = (items: ReturnType<typeof queryFiles>['items']) => items.map((x) => x.packageName);
describe('后台索引有效批次', () => {
  it('只读连接看不到暂存批次，完整发布才切换且不能写库', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mirrorn-db-'));
    const path = join(dir, 'index.sqlite');
    const writer = indexFixture(path);
    const reader = openReadDatabase(path);
    try {
      fixtureSnapshot(writer, 'old', [fixtureFile('old')]);
      const batch = beginSnapshot(writer, aptScope, 'new');
      stageFiles(writer, batch.id, [fixtureFile('new')]);
      expect(names(queryFiles(reader, { resource: 'pku:debian' }).items)).toEqual(['old']);
      expect(() => reader.prepare('DELETE FROM files').run()).toThrow();
      publishSnapshot(writer, batch.id, 'digest');
      expect(names(queryFiles(reader, { resource: 'pku:debian' }).items)).toEqual(['new']);
    } finally {
      reader.close();
      writer.close();
      rmSync(dir, { recursive: true });
    }
  });
  it('失败、异常空、异常骤减均保留旧数据，另一个架构成功也不删除它', () => {
    const db = indexFixture();
    try {
      fixtureSnapshot(
        db,
        'old',
        Array.from({ length: 10 }, (_, i) => fixtureFile(`pkg${i}`)),
      );
      const empty = beginSnapshot(db, aptScope, 'empty');
      expect(() => publishSnapshot(db, empty.id, 'empty')).toThrow();
      const short = beginSnapshot(db, aptScope, 'short');
      stageFiles(db, short.id, [fixtureFile('short')]);
      expect(() => publishSnapshot(db, short.id, 'short')).toThrow();
      rejectSnapshot(db, short.id, 'truncated');
      fixtureSnapshot(db, 'arm', [{ ...fixtureFile('arm'), arch: 'arm64' }], {
        ...aptScope,
        indexUrl: aptScope.indexUrl.replace('amd64', 'arm64'),
        architecture: 'arm64',
      });
      expect(queryFiles(db, { resource: 'pku:debian', arch: 'amd64' }).items).toHaveLength(10);
      expect(names(queryFiles(db, { resource: 'pku:debian', arch: 'arm64' }).items)).toEqual([
        'arm',
      ]);
    } finally {
      db.close();
    }
  });
  it('较旧并发批次不能覆盖新批次，重试已发布任务幂等', () => {
    const db = indexFixture();
    try {
      const slow = beginSnapshot(db, aptScope, 'slow');
      stageFiles(db, slow.id, [fixtureFile('slow')]);
      const fast = fixtureSnapshot(db, 'fast', [fixtureFile('fast')]);
      expect(() => publishSnapshot(db, slow.id, 'slow')).toThrow();
      expect(beginSnapshot(db, aptScope, 'fast').alreadyPublished).toBe(true);
      expect(publishSnapshot(db, fast.id, 'same')).toBe(1);
      expect(names(queryFiles(db, { resource: 'pku:debian' }).items)).toEqual(['fast']);
    } finally {
      db.close();
    }
  });
  it('跨更新分页固定同一批次，新查询读取新批次', () => {
    const db = indexFixture();
    try {
      fixtureSnapshot(db, 'a', [fixtureFile('a1'), fixtureFile('a2'), fixtureFile('a3')]);
      const page = queryFiles(db, { resource: 'pku:debian', limit: 2 });
      expect(page.nextCursor).not.toBeNull();
      fixtureSnapshot(db, 'b', [fixtureFile('b1'), fixtureFile('b2'), fixtureFile('b3')]);
      const next = queryFiles(db, { resource: 'pku:debian', limit: 2, cursor: page.nextCursor! });
      expect(names([...page.items, ...next.items])).toEqual(['a1', 'a2', 'a3']);
      expect(names(queryFiles(db, { resource: 'pku:debian' }).items)).toEqual(['b1', 'b2', 'b3']);
      expect(() =>
        queryFiles(db, { resource: 'pku:debian', q: 'other', cursor: page.nextCursor! }),
      ).toThrow();
    } finally {
      db.close();
    }
  });
  it('同包多发行版能精确筛选，不能入库其它站或外域文件', () => {
    const db = indexFixture();
    try {
      fixtureSnapshot(db, 'bookworm', [fixtureFile()]);
      fixtureSnapshot(db, 'trixie', [fixtureFile('hello', '2.10-4')], {
        ...aptScope,
        indexUrl: aptScope.indexUrl.replace('bookworm', 'trixie'),
        release: 'trixie',
      });
      expect(
        queryFiles(db, {
          resource: 'pku:debian',
          package: 'hello',
          release: 'trixie',
          arch: 'amd64',
        }).items.map((x) => x.version),
      ).toEqual(['2.10-4']);
      fixtureSnapshot(db, 'same-url', [fixtureFile()], {
        ...aptScope,
        indexUrl: aptScope.indexUrl.replace('bookworm', 'forky'),
        release: 'forky',
      });
      expect(queryFiles(db, { resource: 'pku:debian', release: 'bookworm' }).items).toHaveLength(1);
      expect(queryFiles(db, { resource: 'pku:debian', release: 'forky' }).items).toHaveLength(1);
      expect(() => beginSnapshot(db, { ...aptScope, resourceId: 'ustc:debian' }, 'bad')).toThrow();
      const batch = beginSnapshot(db, aptScope, 'outside');
      expect(() =>
        stageFiles(db, batch.id, [{ ...fixtureFile(), url: 'https://example.com/file.deb' }]),
      ).toThrow();
      expect(() => queryFiles(db, { resource: 'ustc:debian' })).toThrow();
    } finally {
      db.close();
    }
  });
  it('清理不删除仍有效批次；刚替换的旧批次也保留供游标读取', () => {
    const db = indexFixture();
    try {
      const first = fixtureSnapshot(db, 'first', [fixtureFile('first')], aptScope, 1);
      collectOldSnapshots(db, 3 * 86400000);
      expect(queryFiles(db, { resource: 'pku:debian' }).items).toHaveLength(1);
      const next = fixtureSnapshot(db, 'next', [fixtureFile('next')], aptScope, 3 * 86400000);
      collectOldSnapshots(db, 3 * 86400000);
      expect(db.prepare('SELECT id FROM snapshots WHERE id=?').get(first.id)).toBeTruthy();
      expect(db.prepare('SELECT id FROM snapshots WHERE id=?').get(next.id)).toBeTruthy();
    } finally {
      db.close();
    }
  });
});

describe('后台延迟重试的时间边界', () => {
  it('较早索引的重试或延迟首次执行，都不能覆盖后来发现并发布的数据', () => {
    const db = indexFixture();
    try {
      const oldScope = { ...aptScope, discoveryEpoch: 100 };
      const old = beginSnapshot(db, oldScope, 'old-delay');
      stageFiles(db, old.id, [fixtureFile('old')]);
      rejectSnapshot(db, old.id, new Error('temporary interruption'));
      fixtureSnapshot(db, 'new-published', [fixtureFile('new')], {
        ...aptScope,
        discoveryEpoch: 200,
      });
      const retry = beginSnapshot(db, oldScope, 'old-delay');
      stageFiles(db, retry.id, [fixtureFile('old')]);
      expect(() => publishSnapshot(db, retry.id, 'old-digest')).toThrow('较旧');
      const late = beginSnapshot(db, oldScope, 'late-first-start');
      stageFiles(db, late.id, [fixtureFile('even-older')]);
      expect(() => publishSnapshot(db, late.id, 'late-digest')).toThrow('较旧');
      expect(
        queryFiles(db, { resource: 'pku:debian' }).items.map((file) => file.packageName),
      ).toEqual(['new']);
    } finally {
      db.close();
    }
  });
});

it('Python包名的大小写、下划线、点与短横线别名统一检索已入库数据，不把其它协议强行改名', () => {
  const db = indexFixture();
  try {
    db.prepare("UPDATE resources SET repo_id='pypi' WHERE id='pku:debian'").run();
    fixtureSnapshot(db, 'python', [fixtureFile('hello-world')]);
    const input = { resource: 'pku:debian', package: 'Hello.World' };
    expect(queryFiles(db, input).items[0]?.packageName).toBe('hello-world');
    expect(queryFiles(db, { resource: input.resource, q: 'HELLO_WORLD' }).items).toHaveLength(1);
    expect(queryFileOptions(db, input).versions).toContain(fixtureFile('hello-world').version);
    db.prepare("UPDATE resources SET repo_id='CRAN' WHERE id='pku:debian'").run();
    expect(queryFiles(db, input).items).toHaveLength(0);
  } finally {
    db.close();
  }
});
