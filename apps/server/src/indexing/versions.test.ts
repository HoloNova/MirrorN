import { describe, it, expect } from 'vitest';
import { compareRepoVersions } from './versions.js';
import { queryFileOptions } from '../db/fileQueries.js';
import { fixtureFile, fixtureSnapshot, indexFixture } from '../db/indexFixture.js';
describe('按协议版本比较和数据库筛选', () => {
  it('Debian epoch/tilde、PEP440及semver不用字典序判断最新', () => {
    expect(compareRepoVersions('debian', '2:1.0-1', '1:99.0-1')).toBeGreaterThan(0);
    expect(compareRepoVersions('debian', '1.0~rc1-1', '1.0-1')).toBeLessThan(0);
    expect(compareRepoVersions('pypi', '1.0rc1', '1.0')).toBeLessThan(0);
    expect(compareRepoVersions('nodejs-release', 'v9.0.0', 'v24.0.0')).toBeLessThan(0);
  });
  it('依赖仓库默认不混用不同包版本；限定包名后查询并排序完整版本', () => {
    const db = indexFixture();
    try {
      fixtureSnapshot(db, 'versions', [
        fixtureFile('hello', '1:99.0-1'),
        fixtureFile('hello', '2:1.0-1'),
        fixtureFile('different', '999.0'),
      ]);
      expect(queryFileOptions(db, { resource: 'pku:debian' }).versions).toEqual([]);
      expect(queryFileOptions(db, { resource: 'pku:debian', package: 'hello' }).versions).toEqual([
        '2:1.0-1',
        '1:99.0-1',
      ]);
    } finally {
      db.close();
    }
  });
});
