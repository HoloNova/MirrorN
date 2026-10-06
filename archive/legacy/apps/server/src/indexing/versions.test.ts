import { describe, it, expect } from 'vitest';
import { compareRepoVersions } from './versions.js';
import { fixtureDownload, fixtureRun, indexFixture } from '../db/indexFixture.js';
import { queryFileOptions } from '../db/fileQueries.js';

describe('软件版本排序', () => {
  it('Node按语义版本而非字典序，安装器日期/构建版本按数字自然序', () => {
    expect(compareRepoVersions('nodejs-release', 'v9.0.0', 'v24.0.0')).toBeLessThan(0);
    expect(compareRepoVersions('nodejs-release', 'v24.0.0-rc.1', 'v24.0.0')).toBeLessThan(0);
    expect(compareRepoVersions('anaconda', '2024.9-0', '2024.11-0')).toBeLessThan(0);
    expect(compareRepoVersions('anaconda', 'latest', '2025.06-0')).toBeGreaterThan(0);
  });
  it('版本选择器来自有效软件版本，不把其它软件的版本混进来', () => {
    const db = indexFixture();
    try {
      fixtureRun(db, [
        fixtureDownload('node-v9.0.0-x64.msi', 'v9.0.0'),
        fixtureDownload('node-v24.1.0-x64.msi', 'v24.1.0'),
      ]);
      expect(queryFileOptions(db, { resource: 'pku:nodejs-release' }).versions).toEqual([
        'v24.1.0',
        'v9.0.0',
      ]);
      expect(queryFileOptions(db, { resource: 'pku:anaconda' }).versions).toEqual([]);
    } finally {
      db.close();
    }
  });
});
