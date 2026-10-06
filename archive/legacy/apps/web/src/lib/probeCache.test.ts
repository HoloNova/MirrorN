import { describe, expect, it, vi } from 'vitest';

import {
  PROBE_CACHE_TTL_MS,
  PROBE_FAILURE_RETRY_MS,
  type ProbeResult,
  type ProbeTarget,
} from '@mirrorn/shared/probe';

import {
  createProbeCache,
  PROBE_CACHE_ENTRY_MAX_AGE_MS,
  PROBE_CACHE_MAX_ENTRIES,
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

  it('drops expired successful results and caps the number of entries', () => {
    const cache = createProbeCache({ storage: null });
    const target = targets[0];
    if (!target) {
      throw new Error('测试数据缺失');
    }
    const now = 1_758_000_000_000;

    // 过期的成功结果不再保留：过期即等于没有数据，不能等下一次读取时又把它当可用结果。
    cache.write(
      [{ target, result: probeResult({ measuredAt: now - PROBE_CACHE_TTL_MS - 1 }) }],
      now - PROBE_CACHE_TTL_MS - 1,
    );
    cache.write([{ target, result: probeResult({ probeId: 'fresh-probe' }) }], now);

    expect(cache.read().map((entry) => entry.probeId)).toEqual(['fresh-probe']);

    for (let index = 0; index < PROBE_CACHE_MAX_ENTRIES + 5; index += 1) {
      cache.write([{ target, result: probeResult({ probeId: `probe-${index}` }) }], now + index);
    }
    expect(cache.read().length).toBeLessThanOrEqual(PROBE_CACHE_MAX_ENTRIES);
  });

  it('keeps a failure record only until it can no longer block a retry', () => {
    const cache = createProbeCache({ storage: null });
    const alpha = targets[0];
    if (!alpha) {
      throw new Error('测试数据缺失');
    }
    const beta: ProbeTarget = {
      mirrorId: 'other-mirror',
      probe: {
        id: 'other-robots',
        url: 'https://other.example.com/robots.txt',
        mode: 'no-cors',
        method: 'get',
        cacheBust: false,
      },
    };
    const now = 1_758_000_000_000;

    cache.writeFailure(
      [{ target: alpha, result: probeResult({ status: 'failed', durationMs: null }) }],
      now,
    );
    cache.writeFailure(
      [
        {
          target: beta,
          result: probeResult({
            probeId: 'other-robots',
            status: 'failed',
            durationMs: null,
            measuredAt: now + PROBE_CACHE_ENTRY_MAX_AGE_MS + 1,
          }),
        },
      ],
      now + PROBE_CACHE_ENTRY_MAX_AGE_MS + 1,
    );

    // alpha 的失败记录已经超过保留上限、不可能再阻止重试了，不占存储；beta 的还在。
    expect(cache.read().map((entry) => entry.probeId)).toEqual(['other-robots']);
  });

  it('drops only the requested probes', () => {
    const cache = createProbeCache({ storage: null });
    const target = targets[0];
    if (!target) {
      throw new Error('测试数据缺失');
    }
    const now = 1_758_000_000_000;

    cache.write([{ target, result: probeResult() }], now);
    cache.drop(['example-robots'], now);

    expect(cache.read()).toEqual([]);

    // 没有传探针 id 时什么也不做（不然手动重测会把整份缓存清掉）。
    cache.write([{ target, result: probeResult() }], now);
    cache.drop([], now);
    expect(cache.read()).toHaveLength(1);
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

    expect(results.get('example-mirror')?.durationMs).toBe(42);
    expect(decisions.get('example-mirror')).toBe('fresh');
  });

  it('treats an expired result as no data at all, and plans a re-measure', () => {
    const { results, decisions } = select([
      entry({ ok: { result: probeResult(), expiresAt: now - 1 } }),
    ]);

    // 过期的数字不再展示：没有数据就是没有数据，重测到才有（用户口径）。
    expect(results.size).toBe(0);
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

  it('keeps using a result the failed attempt did not supersede', () => {
    const { results, decisions } = select([
      entry({
        ok: { result: probeResult({ durationMs: 42 }), expiresAt: now + 1000 },
        lastAttempt: { status: 'timeout', at: now - 100, durationMs: null },
      }),
    ]);

    // 这条结果还在 3 小时内：它仍是数据，不因为“手动重测失败了一次”就被丢掉。
    // （没测到就等于没数据的情形发生在没有有效结果时，见下一条用例。）
    expect(results.get('example-mirror')?.durationMs).toBe(42);
    expect(decisions.get('example-mirror')).toBe('fresh');
  });

  it('does not retry a source that just failed, but does after the cooldown', () => {
    const failed = entry({
      ok: { result: probeResult(), expiresAt: now - 1 },
      lastAttempt: { status: 'timeout', at: now - 1000, durationMs: null },
    });

    const throttled = select([failed]);
    expect(throttled.decisions.get('example-mirror')).toBe('throttled');
    // 冷却期内展示的是那次失败（没有数值），不是过期的那份旧数据。
    expect(throttled.results.get('example-mirror')?.durationMs).toBe(null);
    expect(throttled.results.get('example-mirror')?.status).toBe('timeout');

    // 冷却期过后重新允许自动重测。
    const old = entry({
      ok: { result: probeResult(), expiresAt: now - 1 },
      lastAttempt: { status: 'timeout', at: now - PROBE_FAILURE_RETRY_MS - 1, durationMs: null },
    });
    const retryable = select([old]);
    expect(retryable.decisions.get('example-mirror')).toBe('measure');
    // 能重测了，但屏上仍然没有数值：只有那条失败状态。
    expect(retryable.results.get('example-mirror')?.durationMs).toBeNull();
    expect(retryable.results.get('example-mirror')?.status).toBe('timeout');
  });

  it('shows the failure itself when there is no successful result to keep', () => {
    const { results, decisions } = select([
      entry({
        ok: undefined,
        lastAttempt: { status: 'failed', at: now - 100, durationMs: null },
      }),
    ]);

    expect(results.get('example-mirror')?.status).toBe('failed');
    expect(decisions.get('example-mirror')).toBe('throttled');
  });
});
