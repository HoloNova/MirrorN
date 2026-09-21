import { describe, expect, it } from 'vitest';

import { getCatalog } from './ecosystems';
import { MIRROR_KIND_LABELS } from './mirrorKind';
import { findSiteRow, listSiteRows, matchesSiteQuery } from './sites';

const catalog = getCatalog();
const rows = listSiteRows(catalog);

describe('listSiteRows', () => {
  it('为每个镜像站生成一行，且覆盖的生态数与数据一致', () => {
    expect(rows).toHaveLength(catalog.mirrors.length);

    for (const mirror of catalog.mirrors) {
      const row = rows.find((item) => item.id === mirror.id);
      expect(row, `缺少站点 ${mirror.id}`).toBeDefined();

      const expected = catalog.ecosystems.filter((ecosystem) =>
        ecosystem.supports.some((support) => support.mirrorId === mirror.id),
      ).length;
      expect(row?.ecosystems).toHaveLength(expected);
      expect(row?.kindLabel).toBe(MIRROR_KIND_LABELS[mirror.kind]);
      expect(row?.hasProbe).toBe(mirror.probe !== undefined);
      expect(row?.probeUrl).toBe(mirror.probe?.url);
      expect(row?.statusUrl).toBe(mirror.statusSource?.url);
      expect(row?.sources).toHaveLength(mirror.sources.length);
    }
  });

  it('按覆盖生态数从多到少排序', () => {
    const counts = rows.map((row) => row.ecosystems.length);
    expect(counts).toEqual([...counts].sort((left, right) => right - left));
    expect(rows[0]?.ecosystems.length).toBeGreaterThan(0);
  });

  it('每个仓库地址都能在对应生态的数据里找到', () => {
    for (const row of rows) {
      for (const link of row.ecosystems) {
        const ecosystem = catalog.ecosystems.find((item) => item.id === link.id);
        const support = ecosystem?.supports.find((item) => item.mirrorId === row.id);
        expect(support?.repositoryUrl).toBe(link.repositoryUrl);
        expect(support?.supportsPublish).toBe(link.supportsPublish);
        expect(link.statusJob).toBe(support?.statusJob);
      }
    }
  });
});

describe('matchesSiteQuery', () => {
  it('空查询保留全部站点', () => {
    expect(rows.filter((row) => matchesSiteQuery(row, '   '))).toHaveLength(rows.length);
  });

  it('站点名、别名与英文别名都能命中同一个站点', () => {
    for (const needle of ['清华大学开源软件镜像站', '清华', 'tuna', 'THU']) {
      const matched = rows.filter((row) => matchesSiteQuery(row, needle));
      expect(
        matched.map((row) => row.id),
        needle,
      ).toContain('tsinghua');
    }
  });

  it('类别、生态名与仓库地址也参与匹配', () => {
    expect(rows.filter((row) => matchesSiteQuery(row, '高校')).length).toBeGreaterThan(0);
    expect(rows.filter((row) => matchesSiteQuery(row, 'pypi')).length).toBeGreaterThan(0);
    expect(
      rows.filter((row) => matchesSiteQuery(row, 'archive.ubuntu.com')).map((row) => row.id),
      'apt 官方仓库地址应能被搜到',
    ).toContain('ubuntu-official');
  });

  it('匹配不到时返回空列表', () => {
    expect(rows.filter((row) => matchesSiteQuery(row, '不存在的站点名字'))).toEqual([]);
  });
});

describe('findSiteRow', () => {
  it('按 id 取行，未知 id 返回 undefined', () => {
    expect(findSiteRow(rows, 'tsinghua')?.id).toBe('tsinghua');
    expect(findSiteRow(rows, 'not-a-site')).toBeUndefined();
  });
});
