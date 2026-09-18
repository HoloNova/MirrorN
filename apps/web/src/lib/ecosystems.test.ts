import { describe, expect, it } from 'vitest';

import {
  getCatalog,
  getEcosystem,
  getMirrorName,
  getTroubleshooting,
  listEcosystemMirrors,
} from './ecosystems';

describe('static catalog', () => {
  it('loads every ecosystem file from data/ecosystems in a stable order', () => {
    const catalog = getCatalog();

    expect(catalog.ecosystems.map((ecosystem) => ecosystem.id)).toEqual(['npm', 'pip']);
    expect(catalog.mirrors.length).toBeGreaterThanOrEqual(5);
    expect(catalog.troubleshooting.length).toBeGreaterThanOrEqual(2);
  });

  it('resolves a mirror name without inventing a fallback record', () => {
    const catalog = getCatalog();

    expect(getMirrorName('tsinghua', catalog)).toBe('清华大学开源软件镜像站');
    expect(getMirrorName('unknown-mirror', catalog)).toBe('unknown-mirror');
  });

  it('links every ecosystem support to an existing mirror record', () => {
    const catalog = getCatalog();

    for (const ecosystem of catalog.ecosystems) {
      const mirrors = listEcosystemMirrors(ecosystem, catalog);
      expect(mirrors.length).toBe(ecosystem.supports.length);
      expect(mirrors.every((mirror) => mirror.homepageUrl.startsWith('https://'))).toBe(true);
    }
  });

  it('finds troubleshooting entries for each ecosystem, and knows nothing about unknown ones', () => {
    expect(getTroubleshooting('pip').length).toBeGreaterThan(0);
    expect(getTroubleshooting('npm').length).toBeGreaterThan(0);
    expect(getTroubleshooting('unknown')).toEqual([]);
  });

  it('returns undefined for an ecosystem that is not in the data', () => {
    expect(getEcosystem('pip')?.name).toBe('Python / pip');
    expect(getEcosystem('ruby')).toBeUndefined();
  });
});
