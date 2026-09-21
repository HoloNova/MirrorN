import { describe, expect, it, vi } from 'vitest';

import {
  PROBE_CACHE_TTL_MS,
  PROBE_FAILURE_RETRY_MS,
  type ProbeResult,
  type ProbeTarget,
} from '@mirrorn/shared/probe';

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
    expect(entry?.probeId).toBe('example-robots');
    expect(entry?.ok?.expiresAt).toBe(now + PROBE_CACHE_TTL_MS);
    expect(entry?.ok?.result.durationMs).toBe(42);
    expect(entry?.lastAttempt).toMatchObject({ status: 'ok' });
  });

  it('ignores data written by another cache version', () => {
    const storage = createMemoryStorage({
      [`mirrorn.probe-cache.v${PROBE_CACHE_VERSION}`]: JSON.stringify({
        version: PROBE_CACHE_VERSION + 1,
        entries: [{ probeId: 'x', signature: 'x' }],
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
          {
            probeId: 'ok',
            signature: 'ok',
            ok: { result: probeResult(), expiresAt: 10 },
            lastAttempt: { status: 'ok', at: 5, durationMs: 42 },
          },
          {
            probeId: 'bad-status',
            signature: 'bad-status',
            ok: { result: probeResult({ status: 'weird' as never }), expiresAt: 10 },
            lastAttempt: { status: 'ok', at: 5, durationMs: 42 },
          },
          {
            probeId: 'bad-duration',
            signature: 'bad-duration',
            ok: { result: { ...probeResult(), durationMs: 'fast' }, expiresAt: 10 },
            lastAttempt: { status: 'ok', at: 5, durationMs: 42 },
          },
          {
            probeId: '',
            signature: 'no-probe-id',
            lastAttempt: { status: 'ok', at: 5, durationMs: 42 },
          },
          {
            probeId: 'bad-expiry',
            signature: 'bad-expiry',
            ok: { result: probeResult(), expiresAt: 'soon' },
            lastAttempt: { status: 'ok', at: 5, durationMs: 42 },
          },
          {
            probeId: 'bad-attempt',
            signature: 'bad-attempt',
            lastAttempt: { status: 'weird', at: 5, durationMs: 42 },
          },
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

    expect(cache.read().map((entry) => entry.probeId)).toEqual(['fresh-probe']);

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

describe('writeFailure', () => {
  const now = 1_758_000_000_000;
  const target = targets[0];
  if (!target) {
    throw new Error('测试数据缺失');
  }

  it('keeps the last successful result and only records the failed attempt', () => {
    const cache = createProbeCache({ storage: null });
    cache.write([{ target, result: probeResult({ durationMs: 42 }) }], now);

    cache.writeFailure(
      [
        {
          target,
          result: probeResult({ status: 'timeout', durationMs: null, measuredAt: now + 5 }),
        },
      ],
      now + 5,
    );

    const [entry] = cache.read();
    expect(entry?.ok?.result.durationMs).toBe(42);
    expect(entry?.ok?.expiresAt).toBe(now + PROBE_CACHE_TTL_MS);
    expect(entry?.lastAttempt).toMatchObject({ status: 'timeout', at: now + 5 });
  });

  it('records a failure even when there is nothing successful to keep', () => {
    const cache = createProbeCache({ storage: null });

    cache.writeFailure(
      [{ target, result: probeResult({ status: 'failed', durationMs: null, measuredAt: now }) }],
      now,
    );

    const [entry] = cache.read();
    expect(entry?.ok).toBeUndefined();
    expect(entry?.lastAttempt.status).toBe('failed');
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
      probeId: 'example-robots',
      signature: probeSignature(target),
      ok: { result: probeResult(), expiresAt: now + 1000 },
      lastAttempt: { status: 'ok', at: now - 500, durationMs: 42 },
      ...overrides,
    };
  }

  function select(entries: ProbeCacheEntry[], fingerprint?: string) {
    return selectCachedResults(entries, targets, now, fingerprint);
  }

  it('returns fresh results keyed by mirror id and skips measuring them', () => {
    const { results, decisions } = select([entry()]);

    expect(results.get('example-mirror')).toMatchObject({ stale: false, attemptFailed: false });
    expect(decisions.get('example-mirror')).toBe('fresh');
  });

  it('marks expired results as stale instead of hiding them, and plans a re-measure', () => {
    const { results, decisions } = select([
      entry({ ok: { result: probeResult(), expiresAt: now - 1 } }),
    ]);

    expect(results.get('example-mirror')?.stale).toBe(true);
    expect(decisions.get('example-mirror')).toBe('measure');
  });

  it('ignores results whose probe signature changed', () => {
    const { results } = select([
      entry({ signature: 'example-robots|cors|get|cached|https://example.com/robots.txt' }),
    ]);

    expect(results.size).toBe(0);
  });

  it('ignores results for probes that are not part of the current candidates', () => {
    const { results } = select([entry({ probeId: 'other-probe' })]);

    expect(results.size).toBe(0);
  });

  // ── 本次改动新增的三条规则：换网作废、失败不覆盖、失败后不连打 ─────────────

  it('discards measurements recorded on another network', () => {
    const { results, decisions } = select(
      [entry({ ok: { result: probeResult(), expiresAt: now + 1000, fingerprint: 'net-a' } })],
      'net-b',
    );

    expect(results.size).toBe(0);
    expect(decisions.get('example-mirror')).toBe('measure');
  });

  it('keeps measurements when either side has no fingerprint', () => {
    const recorded = entry({
      ok: { result: probeResult(), expiresAt: now + 1000, fingerprint: 'net-a' },
    });

    // 当前拿不到指纹（静态部署 / 接口不可用）：无法判断，继续用缓存。
    expect(select([recorded], undefined).decisions.get('example-mirror')).toBe('fresh');
    // 缓存里没记指纹（旧条目）：同样继续用。
    expect(select([entry()], 'net-b').decisions.get('example-mirror')).toBe('fresh');
  });

  it('shows the last successful value when the latest attempt failed', () => {
    const { results, decisions } = select([
      entry({
        ok: { result: probeResult({ durationMs: 42 }), expiresAt: now + 1000 },
        lastAttempt: { status: 'timeout', at: now - 100, durationMs: null },
      }),
    ]);

    // 显示的是上一次成功的 42 ms，而不是这次超时；悬停提示由 attemptFailed 说明。
    expect(results.get('example-mirror')).toMatchObject({ attemptFailed: true });
    expect(results.get('example-mirror')?.result.durationMs).toBe(42);
    // 还在有效期内，因此不需要为了这次失败再测一遍。
    expect(decisions.get('example-mirror')).toBe('fresh');
  });

  it('does not retry a source that just failed, but does after the cooldown', () => {
    const failed = entry({
      ok: { result: probeResult(), expiresAt: now - 1 },
      lastAttempt: { status: 'timeout', at: now - 1000, durationMs: null },
    });

    expect(select([failed]).decisions.get('example-mirror')).toBe('throttled');
    expect(select([failed]).results.get('example-mirror')?.stale).toBe(true);

    // 冷却期过后重新允许自动重测。
    const old = entry({
      ok: { result: probeResult(), expiresAt: now - 1 },
      lastAttempt: { status: 'timeout', at: now - PROBE_FAILURE_RETRY_MS - 1, durationMs: null },
    });
    expect(select([old]).decisions.get('example-mirror')).toBe('measure');
  });

  it('shows the failure itself when there is no successful result to keep', () => {
    const { results, decisions } = select([
      entry({
        ok: undefined,
        lastAttempt: { status: 'failed', at: now - 100, durationMs: null },
      }),
    ]);

    expect(results.get('example-mirror')?.result.status).toBe('failed');
    expect(decisions.get('example-mirror')).toBe('throttled');
  });
});
