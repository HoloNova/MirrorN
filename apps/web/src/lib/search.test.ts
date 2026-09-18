import { describe, expect, it } from 'vitest';

import { getCatalog } from './ecosystems';
import { createSearchIndex, MAX_RESULTS, type MirrorHit } from './search';

const index = createSearchIndex(getCatalog());

function ids(query: string): string[] {
  return index.search(query).map((hit) => hit.id);
}

describe('search index', () => {
  it('finds an ecosystem by its own name and package manager', () => {
    expect(ids('pip')).toContain('ecosystem:pip');
    expect(ids('npm')).toContain('ecosystem:npm');
  });

  it('finds an ecosystem by a Chinese alias written in data', () => {
    expect(ids('装python')).toContain('ecosystem:pip');
    expect(ids('换源')).toContain('ecosystem:npm');
  });

  it('finds mirrors by pinyin, English and Chinese aliases', () => {
    expect(ids('tengxun')).toContain('mirror:tencent');
    expect(ids('tencent')).toContain('mirror:tencent');
    expect(ids('腾讯')).toContain('mirror:tencent');
    expect(ids('tsinghua')).toContain('mirror:tsinghua');
    expect(ids('清华源')).toContain('mirror:tsinghua');
    expect(ids('淘宝源')).toContain('mirror:npmmirror');
  });

  it('is case insensitive', () => {
    expect(ids('PYTHON')).toContain('ecosystem:pip');
    expect(ids('Tencent')).toContain('mirror:tencent');
  });

  it('narrows results for multi-token queries instead of widening them', () => {
    const single = ids('阿里云');
    const narrowed = index.search('阿里云 pip');

    expect(single).toContain('mirror:aliyun');
    expect(narrowed.every((hit) => hit.id === 'mirror:aliyun' || hit.id === 'ecosystem:pip')).toBe(
      true,
    );
    expect(narrowed.length).toBeLessThanOrEqual(single.length + 1);
  });

  it('returns nothing for an empty or whitespace-only query', () => {
    expect(index.search('')).toEqual([]);
    expect(index.search('   ')).toEqual([]);
    expect(index.search('\n\t')).toEqual([]);
  });

  it('returns nothing for a query that matches no data', () => {
    expect(index.search('zzz-不存在的生态-zzz')).toEqual([]);
  });

  it('never returns a mirror card without an actionable ecosystem', () => {
    const mirrorHits = index
      .search('镜像')
      .filter((hit): hit is MirrorHit => hit.kind === 'mirror');

    expect(mirrorHits.length).toBeGreaterThan(0);
    for (const hit of mirrorHits) {
      expect(hit.ecosystemIds.length).toBeGreaterThan(0);
    }
  });

  it('lists the ecosystems a mirror actually serves', () => {
    const aliyun = index.search('阿里云').find((hit) => hit.id === 'mirror:aliyun');

    expect(aliyun?.kind).toBe('mirror');
    expect(aliyun?.kind === 'mirror' && aliyun.ecosystemIds).toEqual(['pip']);
  });

  it('caps the result list', () => {
    expect(index.search('源').length).toBeLessThanOrEqual(MAX_RESULTS);
    expect(index.search('pip').length).toBeLessThanOrEqual(MAX_RESULTS);
  });

  it('ranks ecosystem results above mirror results', () => {
    // 搜生态名时用户最可能想配置该生态；镜像命中仍然保留在列表里。
    const pip = index.search('pip');
    expect(pip[0]?.id).toBe('ecosystem:pip');
    expect(pip.some((hit) => hit.kind === 'mirror')).toBe(true);

    expect(index.search('npm')[0]?.id).toBe('ecosystem:npm');
    expect(index.search('pypi')[0]?.id).toBe('ecosystem:pip');
  });

  it('still returns mirrors when the query is a mirror brand', () => {
    for (const query of ['tuna', '腾讯云', '淘宝源', 'aliyun']) {
      expect(index.search(query).some((hit) => hit.kind === 'mirror')).toBe(true);
    }
  });

  it('is built once and reused, so repeated queries are pure', () => {
    const first = index.search('pip');
    const second = index.search('pip');

    expect(second.map((hit) => hit.id)).toEqual(first.map((hit) => hit.id));
  });
});
