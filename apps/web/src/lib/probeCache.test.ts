import { describe, expect, it, vi } from 'vitest';

import { PROBE_CACHE_TTL_MS, type ProbeResult, type ProbeTarget } from '@mirrorn/shared/probe';

import {
  createProbeCache,
  PROBE_CACHE_MAX_ENTRIES,
  PROBE_CACHE_STALE_LIMIT_MS,
  PROBE_CACHE_VERSION,
  selectCachedResults,
  type ProbeCacheEntry,
  type StorageLike,
} from './probeCache';
import { probeSignature } from './probe';

const targets: ProbeTarget[] = [
  {
    mirrorId: 'example-mirror',
    probe: {
      id: 'example-robots',
      url: 'https://example.com/robots.txt',
      mode: 'no-cors',
      method: 'get',
      cacheBust: false,
    },
  },
];

function probeResult(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    mirrorId: 'example-mirror',
    probeId: 'example-robots',
    status: 'ok',
    durationMs: 42,
    measuredAt: 1_758_000_000_000,
    mode: 'no-cors',
    opaque: true,
    ...overrides,
  };
}

function createMemoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    dump: () => Object.fromEntries(data),
  } satisfies StorageLike & { dump: () => Record<string, string> };
}

describe('createProbeCache', () => {
  it('stores a result with its probe signature and TTL', () => {
    const cache = createProbeCache({ storage: createMemoryStorage() });
    const now = 1_758_000_000_000;
    const target = targets[0];
    if (!target) {
      throw new Error('测试数据缺失');
    }

    cache.write([{ target, result: probeResult() }], now);

    const [entry] = cache.read();
    expect(entry?.signature).toBe(probeSignature(target));
    expect(entry?.expiresAt).toBe(now + PROBE_CACHE_TTL_MS);
    expect(entry?.result.durationMs).toBe(42);
  });

  it('ignores data written by another cache version', () => {
    const storage = createMemoryStorage({
      [`mirrorn.probe-cache.v${PROBE_CACHE_VERSION}`]: JSON.stringify({
        version: PROBE_CACHE_VERSION + 1,
        entries: [{ signature: 'x', expiresAt: 1, result: probeResult() }],
      }),
    });
    const cache = createProbeCache({ storage });

    expect(cache.read()).toEqual([]);
  });

  it('survives corrupted JSON and keeps working afterwards', () => {
    const storage = createMemoryStorage({
      [`mirrorn.probe-cache.v${PROBE_CACHE_VERSION}`]: '{"version":1,"entries":[',
    });
    const cache = createProbeCache({ storage });

    expect(cache.read()).toEqual([]);

    const target = targets[0];
    if (!target) {
      throw new Error('测试数据缺失');
    }
    cache.write([{ target, result: probeResult() }], 1_758_000_000_000);
    expect(cache.read()).toHaveLength(1);
  });

  it('drops entries whose fields do not match the contract', () => {
    const storage = createMemoryStorage({
      [`mirrorn.probe-cache.v${PROBE_CACHE_VERSION}`]: JSON.stringify({
        version: PROBE_CACHE_VERSION,
        entries: [
          { signature: 'ok', expiresAt: 10, result: probeResult() },
          {
            signature: 'bad-status',
            expiresAt: 10,
            result: probeResult({ status: 'weird' as never }),
          },
          {
            signature: 'bad-duration',
            expiresAt: 10,
            result: { ...probeResult(), durationMs: 'fast' },
          },
          { signature: '', expiresAt: 10, result: probeResult() },
          { signature: 'bad-expiry', expiresAt: 'soon', result: probeResult() },
          'not-an-object',
        ],
      }),
    });
    const cache = createProbeCache({ storage });

    const entries = cache.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.signature).toBe('ok');
  });

  it('falls back to memory when the storage write fails', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    const cache = createProbeCache({ storage });
    const target = targets[0];
    if (!target) {
      throw new Error('测试数据缺失');
    }

    cache.write([{ target, result: probeResult() }], 1_758_000_000_000);

    expect(cache.read()).toHaveLength(1);
  });

  it('works without any storage at all', () => {
    const cache = createProbeCache({ storage: null });
    const target = targets[0];
    if (!target) {
      throw new Error('测试数据缺失');
    }

    cache.write([{ target, result: probeResult() }], 1_758_000_000_000);
    expect(cache.read()).toHaveLength(1);

    cache.clear();
    expect(cache.read()).toEqual([]);
  });

  it('drops entries that expired long ago and caps the number of entries', () => {
    const cache = createProbeCache({ storage: null });
    const target = targets[0];
    if (!target) {
      throw new Error('测试数据缺失');
    }
    const now = 1_758_000_000_000;

    cache.write(
      [{ target, result: probeResult() }],
      now - PROBE_CACHE_STALE_LIMIT_MS - PROBE_CACHE_TTL_MS - 1,
    );
    cache.write([{ target, result: probeResult({ probeId: 'fresh-probe' }) }], now);

    expect(cache.read().map((entry) => entry.result.probeId)).toEqual(['fresh-probe']);

    for (let index = 0; index < PROBE_CACHE_MAX_ENTRIES + 5; index += 1) {
      cache.write([{ target, result: probeResult({ probeId: `probe-${index}` }) }], now + index);
    }
    expect(cache.read().length).toBeLessThanOrEqual(PROBE_CACHE_MAX_ENTRIES);
  });

  it('falls back to memory when localStorage is not usable', () => {
    const broken: StorageLike = {
      getItem: () => null,
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      removeItem: () => undefined,
    };
    vi.stubGlobal('localStorage', broken);
    try {
      const cache = createProbeCache();
      const target = targets[0];
      if (!target) {
        throw new Error('测试数据缺失');
      }

      // 构造时就会试写一次，提前发现无痕模式或站点设置导致的不可用。
      expect(broken.setItem).toHaveBeenCalled();

      cache.write([{ target, result: probeResult() }], 1_758_000_000_000);
      expect(cache.read()).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('selectCachedResults', () => {
  const now = 1_758_000_000_000;
  const target = targets[0];
  if (!target) {
    throw new Error('测试数据缺失');
  }

  function entry(overrides: Partial<ProbeCacheEntry> = {}): ProbeCacheEntry {
    return {
      signature: probeSignature(target),
      result: probeResult(),
      expiresAt: now + 1000,
      ...overrides,
    };
  }

  it('returns fresh results keyed by mirror id', () => {
    const selected = selectCachedResults([entry()], targets, now);

    expect(selected.get('example-mirror')).toMatchObject({ stale: false });
  });

  it('marks expired results as stale instead of hiding them', () => {
    const selected = selectCachedResults([entry({ expiresAt: now - 1 })], targets, now);

    expect(selected.get('example-mirror')?.stale).toBe(true);
  });

  it('ignores results whose probe signature changed', () => {
    const selected = selectCachedResults(
      [entry({ signature: 'example-robots|cors|get|cached|https://example.com/robots.txt' })],
      targets,
      now,
    );

    expect(selected.size).toBe(0);
  });

  it('ignores results for probes that are not part of the current candidates', () => {
    const selected = selectCachedResults(
      [entry({ result: probeResult({ probeId: 'other-probe' }) })],
      targets,
      now,
    );

    expect(selected.size).toBe(0);
  });
});
