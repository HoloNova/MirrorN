import { describe, it, expect } from 'vitest';
import { indexFixture, fixtureFile, fixtureSnapshot, aptScope } from './indexFixture.js';
import { beginSnapshot, stageFiles, publishSnapshot, rejectSnapshot } from './snapshots.js';
import { queryFiles } from './fileQueries.js';
describe('有效数据和链接汇总原子更新', () => {
  it('候选窗口全是旧范围重复项时继续找下一窗口，分页不漏文件', () => {
    const db = indexFixture();
    try {
      const files = Array.from({ length: 250 }, (_, i) => fixtureFile(`package-${i}`));
      fixtureSnapshot(db, 'older', files);
      const newest = beginSnapshot(db, { ...aptScope, release: 'other' }, 'newest').id;
      stageFiles(db, newest, files);
      publishSnapshot(db, newest, 'digest');
      const first = queryFiles(db, { resource: 'pku:debian', limit: 1 });
      expect(first.items).toHaveLength(1);
      expect(first.items[0]?.release).toBe('other');
      const next = queryFiles(db, { resource: 'pku:debian', limit: 1, cursor: first.nextCursor! });
      expect(next.items).toHaveLength(1);
      expect(next.items[0]?.url).not.toBe(first.items[0]?.url);
    } finally {
      db.close();
    }
  });
  it('不同采集范围的同一下载URL只算一个，暂存/失败不改变汇总', () => {
    const db = indexFixture();
    try {
      fixtureSnapshot(db, 'first', [fixtureFile()]);
      const count = () =>
        db
          .prepare('SELECT file_count FROM resource_file_stats WHERE resource_id=?')
          .get('pku:debian')?.file_count;
      expect(count()).toBe(1);
      const second = beginSnapshot(db, { ...aptScope, release: 'other' }, 'second').id;
      stageFiles(db, second, [fixtureFile()]);
      expect(count()).toBe(1);
      publishSnapshot(db, second, 'digest');
      expect(count()).toBe(1);
      const broken = beginSnapshot(db, aptScope, 'broken').id;
      stageFiles(db, broken, [fixtureFile('new')]);
      rejectSnapshot(db, broken, 'incomplete');
      expect(count()).toBe(1);
    } finally {
      db.close();
    }
  });
});
