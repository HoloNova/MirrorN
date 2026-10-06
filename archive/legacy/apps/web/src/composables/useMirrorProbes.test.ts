import { describe, expect, it, vi } from 'vitest';

import type { ProbeResult, ProbeTarget } from '@mirrorn/shared/probe';
import { PROBE_CACHE_TTL_MS } from '@mirrorn/shared/probe';

import { createProbeCache } from '../lib/probeCache';
import { createProbeScheduler } from '../lib/probeRound';
import {
  createBrowserProbeEnv,
  createMirrorProbeAccess,
  toProbeTargets,
  useMirrorProbes,
  type ProbeEnv,
} from './useMirrorProbes';

const alpha: ProbeTarget = {
  mirrorId: 'alpha',
  probe: {
    id: 'alpha-robots',
    url: 'https://alpha.example.com/robots.txt',
    mode: 'no-cors',
    method: 'get',
    cacheBust: false,
  },
};

const beta: ProbeTarget = {
  mirrorId: 'beta',
  probe: {
    id: 'beta-robots',
    url: 'https://beta.example.com/robots.txt',
    mode: 'no-cors',
    method: 'get',
    cacheBust: false,
  },
};

const targets = [alpha, beta];

function probeResult(mirrorId: string, durationMs: number, measuredAt = 1_000): ProbeResult {
  return {
    mirrorId,
    probeId: `${mirrorId}-robots`,
    status: 'ok',
    durationMs,
    measuredAt,
    mode: 'no-cors',
    opaque: true,
  };
}

/** 手动放行请求的假 fetch：记录调用次数，并跟踪尚未结束的请求。 */
function createControllableFetch() {
  const active: Array<{ resolve: (response: Response) => void; reject: (error: Error) => void }> =
    [];
  let calls = 0;

  const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      const settle = (): boolean => {
        if (settled) {
          return false;
        }
        settled = true;
        const index = active.indexOf(entry);
        if (index >= 0) {
          active.splice(index, 1);
        }
        return true;
      };
      const entry = {
        resolve: (response: Response): void => {
          if (settle()) {
            resolve(response);
          }
        },
        reject: (error: Error): void => {
          if (settle()) {
            reject(error);
          }
        },
      };

      init?.signal?.addEventListener('abort', () => {
        if (settle()) {
          reject(new DOMException('aborted', 'AbortError'));
        }
      });

      active.push(entry);
    });
  }) as typeof fetch;

  const opaque = { type: 'opaque', status: 0, ok: false, body: null } as unknown as Response;

  return {
    fetchImpl,
    get calls() {
      return calls;
    },
    get activeCount() {
      return active.length;
    },
    resolveNext() {
      active.shift()?.resolve(opaque);
    },
    resolveAll() {
      while (active.length > 0) {
        this.resolveNext();
      }
    },
    /** 让下一个未结束的请求失败（DNS / 断网这类 TypeError）。 */
    failNext() {
      active.shift()?.reject(new TypeError('failed to fetch'));
    },
    failAll() {
      while (active.length > 0) {
        this.failNext();
      }
    },
  };
}

function createFakeEnv(online = true) {
  const handlers: Array<{ onNetworkChange: () => void; onVisible: () => void }> = [];
  const timers = new Map<number, () => void>();
  let nextTimerId = 1;
  let isOnline = online;

  const env: ProbeEnv = {
    isOnline: () => isOnline,
    subscribe: (listener) => {
      handlers.push(listener);
      return () => {
        const index = handlers.indexOf(listener);
        if (index >= 0) {
          handlers.splice(index, 1);
        }
      };
    },
    setTimer: (handler) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, handler);
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id as number);
    },
  };

  return {
    env,
    networkChange: () => handlers.forEach((handler) => handler.onNetworkChange()),
    visible: () => handlers.forEach((handler) => handler.onVisible()),
    runTimers: () => {
      for (const [id, handler] of [...timers]) {
        timers.delete(id);
        handler();
      }
    },
    setOnline: (value: boolean) => {
      isOnline = value;
    },
    get subscriberCount() {
      return handlers.length;
    },
    get timerCount() {
      return timers.size;
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('toProbeTargets', () => {
  it('only keeps mirrors that declare a probe', () => {
    const selected = toProbeTargets([{ id: 'alpha', probe: alpha.probe }, { id: 'no-probe' }]);

    expect(selected.map((target) => target.mirrorId)).toEqual(['alpha']);
  });
});

describe('createBrowserProbeEnv', () => {
  function createFakeTarget(record: string[], name: string, extra: Record<string, unknown> = {}) {
    const listeners = new Map<string, Set<() => void>>();
    return {
      addEventListener: (type: string, handler: () => void) => {
        record.push(`${name}.add:${type}`);
        const set = listeners.get(type) ?? new Set<() => void>();
        set.add(handler);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, handler: () => void) => {
        record.push(`${name}.remove:${type}`);
        listeners.get(type)?.delete(handler);
      },
      listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
      ...extra,
    };
  }

  it('does not subscribe to anything outside a browser', () => {
    const env = createBrowserProbeEnv();
    const unsubscribe = env.subscribe({ onNetworkChange: vi.fn(), onVisible: vi.fn() });

    expect(typeof unsubscribe).toBe('function');
    expect(unsubscribe()).toBeUndefined();
  });

  it('watches window and document, and deliberately not navigator.connection', () => {
    const record: string[] = [];
    const connection = createFakeTarget(record, 'connection');
    vi.stubGlobal('window', createFakeTarget(record, 'window'));
    vi.stubGlobal('document', createFakeTarget(record, 'document', { visibilityState: 'visible' }));
    vi.stubGlobal('navigator', { onLine: true, connection });
    try {
      const env = createBrowserProbeEnv();
      const unsubscribe = env.subscribe({ onNetworkChange: vi.fn(), onVisible: vi.fn() });

      expect(record).toEqual(
        expect.arrayContaining([
          'window.add:online',
          'window.add:offline',
          'window.add:focus',
          'document.add:visibilitychange',
        ]),
      );
      // Chromium 的 connection.change 在“网络质量估算”变化时就派发（与换网无关），
      // 订阅它会把一次估算抖动变成一次全量重测，所以这里刻意不订阅。
      expect(record.some((entry) => entry.startsWith('connection'))).toBe(false);

      unsubscribe();
      expect(record).toContain('window.remove:online');
      expect(connection.listenerCount('change')).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('cleans up already registered listeners when subscribing fails partway', () => {
    const record: string[] = [];
    const windowTarget = createFakeTarget(record, 'window');
    vi.stubGlobal('window', windowTarget);
    // document 不是一个可用的事件目标：注册可见性监听时抛错。
    vi.stubGlobal('document', { visibilityState: 'visible' });
    vi.stubGlobal('navigator', { onLine: true });
    try {
      const env = createBrowserProbeEnv();

      expect(() => env.subscribe({ onNetworkChange: vi.fn(), onVisible: vi.fn() })).toThrow();
      expect(windowTarget.listenerCount('online')).toBe(0);
      expect(windowTarget.listenerCount('focus')).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('createMirrorProbeAccess', () => {
  it('degrades to “cannot measure” when probe setup fails', () => {
    const broken = {
      isOnline: () => {
        throw new Error('navigator 不可用');
      },
      subscribe: () => () => undefined,
      setTimer: (handler: () => void) => setTimeout(handler, 0),
      clearTimer: () => undefined,
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const probes = createMirrorProbeAccess({ getTargets: () => targets, env: broken });

      // 向导仍然可用：所有来源显示“无法测量”，不会抛错、也不会发起请求。
      expect(probes.viewFor('alpha')).toEqual({
        mirrorId: 'alpha',
        hasProbe: false,
        pending: false,
        unavailableReason: 'probing-disabled',
      });
      expect(probes.recommendedMirrorId.value).toBeUndefined();
      expect(probes.refreshing.value).toBe(false);
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});

describe('useMirrorProbes', () => {
  function setup(
    options: {
      online?: boolean;
      list?: ProbeTarget[];
      preload?: Array<{
        target: ProbeTarget;
        result: ProbeResult;
        at: number;
        fingerprint?: string;
      }>;
      fingerprint?: string;
    } = {},
  ) {
    const fetcher = createControllableFetch();
    const fake = createFakeEnv(options.online ?? true);
    const cache = createProbeCache({ storage: null });
    const list = options.list ?? targets;

    for (const entry of options.preload ?? []) {
      cache.write([{ target: entry.target, result: entry.result }], entry.at, entry.fingerprint);
    }

    let clock = 1_000;
    let monotonic = 100;
    let fingerprint = options.fingerprint;
    const probes = useMirrorProbes({
      getTargets: () => list,
      getFingerprint: () => fingerprint,
      cache,
      env: fake.env,
      now: () => clock,
      minRefreshIntervalMs: 30_000,
      scheduler: createProbeScheduler({
        fetchImpl: fetcher.fetchImpl,
        monotonicNow: () => (monotonic += 25),
        epochNow: () => clock,
        // 这些用例验证的是缓存 / 自动刷新 / 离线降级的行为，每次测量只发一遍请求，
        // 这样请求次数可以逐个核对；多次尝试的聚合规则由 probeAggregate.test.ts 单独覆盖。
        limits: { attemptsPerTarget: 1 },
      }),
    });

    return {
      env: fake.env,
      networkChange: fake.networkChange,
      visible: fake.visible,
      runTimers: fake.runTimers,
      setOnline: fake.setOnline,
      get subscriberCount() {
        return fake.subscriberCount;
      },
      get timerCount() {
        return fake.timerCount;
      },
      fetcher,
      cache,
      probes,
      advanceClock: (ms: number) => {
        clock += ms;
      },
      setFingerprint: (value: string | undefined) => {
        fingerprint = value;
      },
    };
  }

  it('reuses a fresh cache and sends no request at all', async () => {
    const context = setup({
      preload: [
        { target: alpha, result: probeResult('alpha', 42), at: 1_000 },
        { target: beta, result: probeResult('beta', 84), at: 1_000 },
      ],
    });

    // 缓存新鲜（3 小时内）：直接显示，一个请求都不发。这就是“不过度测试”的落点。
    expect(context.probes.viewFor('alpha').result?.durationMs).toBe(42);
    expect(context.probes.viewFor('beta').result?.durationMs).toBe(84);
    expect(context.fetcher.calls).toBe(0);
    expect(context.probes.refreshing.value).toBe(false);
    context.probes.dispose();
  });

  it('treats an expired measurement as no data and measures it again', async () => {
    const context = setup({
      list: [alpha],
      preload: [
        { target: alpha, result: probeResult('alpha', 42), at: 1_000 - PROBE_CACHE_TTL_MS - 1 },
      ],
    });

    // 过了 3 小时就等于没有数据：不展示旧数字，直接重测（占位符期间是“测速中”）。
    expect(context.probes.viewFor('alpha').result).toBeUndefined();
    expect(context.probes.viewFor('alpha').pending).toBe(true);
    expect(context.fetcher.activeCount).toBe(1);

    context.fetcher.resolveAll();
    await flush();

    // 换成本轮结果（假时钟每次读表 +25，具体值取决于微任务交错，因此只断言“换了”）。
    const updated = context.probes.viewFor('alpha').result?.durationMs ?? 0;
    expect(updated).toBeGreaterThan(0);
    expect(updated).not.toBe(42);
    expect(context.probes.viewFor('alpha').pending).toBe(false);
    context.probes.dispose();
  });

  it('discards a cached measurement recorded on another network', async () => {
    // 缓存是在 net-a 下测的，而现在处于 net-b：数字不代表当前链路，必须重测。
    const context = setup({
      list: [alpha],
      fingerprint: 'net-b',
      preload: [
        { target: alpha, result: probeResult('alpha', 42), at: 1_000, fingerprint: 'net-a' },
      ],
    });

    expect(context.probes.viewFor('alpha').result).toBeUndefined();
    expect(context.fetcher.calls).toBe(1);
    context.fetcher.resolveAll();
    context.probes.dispose();
  });

  it('leaves no value when the new attempt fails', async () => {
    const context = setup({
      list: [alpha],
      preload: [
        { target: alpha, result: probeResult('alpha', 42), at: 1_000 - PROBE_CACHE_TTL_MS - 1 },
      ],
    });

    expect(context.fetcher.activeCount).toBe(1);
    context.fetcher.failAll();
    await flush();

    // 失败不产生数值：行内只有失败状态，没有毫秒数；过期的那份也不会被拿回来。
    const view = context.probes.viewFor('alpha');
    expect(view.result?.status).toBe('failed');
    expect(view.result?.durationMs).toBeNull();
    expect(context.cache.read()[0]?.ok).toBeUndefined();
    expect(context.cache.read()[0]?.lastAttempt.status).toBe('failed');
    context.probes.dispose();
  });

  it('shows the failure state when nothing was measured', async () => {
    const context = setup({ list: [alpha] });

    context.fetcher.failAll();
    await flush();

    expect(context.probes.viewFor('alpha').result?.status).toBe('failed');
    expect(context.probes.viewFor('alpha').result?.durationMs).toBeNull();
    context.probes.dispose();
  });

  it('does not auto-refresh again within the 30 second floor', async () => {
    const context = setup();
    expect(context.fetcher.calls).toBe(2);
    context.fetcher.resolveAll();
    await flush();

    // 刚测完（30 秒内）再要求自动重新验证：什么也不做。
    context.probes.revalidate();
    await flush();
    expect(context.fetcher.calls).toBe(2);

    // 过期之后、且已过下限：才真的重测。
    context.advanceClock(PROBE_CACHE_TTL_MS + 1);
    context.probes.revalidate();
    await flush();
    expect(context.fetcher.calls).toBe(4);

    context.fetcher.resolveAll();
    context.probes.dispose();
  });

  it('throttles automatic retries after a failure', async () => {
    const context = setup({ list: [alpha] });
    context.fetcher.failAll();
    await flush();
    expect(context.fetcher.calls).toBe(1);

    // 失败后 10 分钟内不再自动重试（但手动刷新不受限制）。
    context.probes.revalidate();
    await flush();
    expect(context.fetcher.calls).toBe(1);

    context.probes.refresh();
    await flush();
    expect(context.fetcher.calls).toBe(2);

    context.fetcher.failAll();
    context.probes.dispose();
  });

  it('lets a manual refresh bypass the floor', async () => {
    const context = setup();
    context.fetcher.resolveAll();
    await flush();
    expect(context.fetcher.calls).toBe(2);

    context.probes.refresh();
    await flush();
    expect(context.fetcher.calls).toBe(4);

    context.fetcher.resolveAll();
    context.probes.dispose();
  });

  it('starts no request while offline and keeps the values it already has', async () => {
    const context = setup();
    context.fetcher.resolveAll();
    await flush();
    expect(context.cache.read()).toHaveLength(2);
    const measured = context.probes.viewFor('alpha').result?.durationMs;

    context.setOnline(false);
    context.networkChange();
    context.runTimers();
    await flush();

    // 离线只停止发请求：已有数据照旧展示（它还算不算数由有效期与指纹决定），缓存也不动。
    expect(context.probes.offline.value).toBe(true);
    expect(context.fetcher.calls).toBe(2);
    expect(context.probes.viewFor('alpha').result?.durationMs).toBe(measured);
    expect(context.cache.read()).toHaveLength(2);
    context.probes.dispose();
  });

  it('measures nothing again on a network event while the data is still within its TTL', async () => {
    const context = setup();
    context.fetcher.resolveAll();
    await flush();

    context.networkChange();
    context.runTimers();
    await flush();

    // 网络事件不再废弃数据：有 3 小时内的结果就一个请求都不发（是否换网由出口指纹判定）。
    expect(context.fetcher.calls).toBe(2);
    expect(context.probes.viewFor('alpha').result).toBeDefined();
    expect(context.cache.read()).toHaveLength(2);

    // 过了有效期之后再补测，而且是按来源补，不是整批重来。
    context.advanceClock(PROBE_CACHE_TTL_MS + 1);
    context.networkChange();
    context.runTimers();
    await flush();
    expect(context.fetcher.calls).toBe(4);
    expect(context.probes.viewFor('alpha').pending).toBe(true);

    context.fetcher.resolveAll();
    context.probes.dispose();
  });

  it('has no data and no recommendation until an expired source is measured again', async () => {
    const context = setup({
      list: [alpha],
      preload: [
        { target: alpha, result: probeResult('alpha', 5), at: 1_000 - PROBE_CACHE_TTL_MS - 1 },
      ],
    });

    // 过期即没有数据：既没有数字，也不会被自动推荐。
    expect(context.probes.viewFor('alpha').result).toBeUndefined();
    expect(context.probes.recommendedMirrorId.value).toBeUndefined();

    context.fetcher.resolveAll();
    await flush();

    expect(context.probes.viewFor('alpha').result?.status).toBe('ok');
    expect(context.probes.recommendedMirrorId.value).toBe('alpha');
    context.probes.dispose();
  });

  it('re-probes on becoming visible only when something is missing or expired', async () => {
    const context = setup();
    context.fetcher.resolveAll();
    await flush();
    const freshCalls = context.fetcher.calls;

    context.visible();
    await flush();
    expect(context.fetcher.calls).toBe(freshCalls);

    context.advanceClock(PROBE_CACHE_TTL_MS + 1);
    context.visible();
    await flush();
    expect(context.fetcher.calls).toBe(freshCalls + 2);

    context.fetcher.resolveAll();
    context.probes.dispose();
  });

  it('stops listening and cancels work when disposed', async () => {
    const context = setup();
    expect(context.subscriberCount).toBe(1);
    expect(context.fetcher.activeCount).toBe(2);

    context.probes.dispose();

    expect(context.subscriberCount).toBe(0);
    expect(context.fetcher.activeCount).toBe(0);
    expect(context.timerCount).toBe(0);
    expect(context.probes.viewFor('alpha').pending).toBe(false);

    context.networkChange();
    context.runTimers();
    expect(context.fetcher.calls).toBe(2);
  });

  it('reports mirrors without a probe as unmeasurable instead of pending', () => {
    const context = setup();

    expect(context.probes.viewFor('alpha').hasProbe).toBe(true);
    expect(context.probes.viewFor('gamma')).toMatchObject({
      hasProbe: false,
      pending: false,
      unavailableReason: 'no-probe',
    });
    expect(context.probes.viewFor('gamma').result).toBeUndefined();

    context.probes.dispose();
  });

  it('stays usable when no candidate has a probe at all', async () => {
    const context = setup({ list: [] });
    await flush();

    expect(context.fetcher.calls).toBe(0);
    expect(context.probes.views.value).toEqual([]);
    expect(context.probes.recommendedMirrorId.value).toBeUndefined();
    expect(context.probes.refreshing.value).toBe(false);
    expect(context.probes.viewFor('alpha')).toMatchObject({
      hasProbe: false,
      pending: false,
    });

    context.probes.refresh();
    expect(context.fetcher.calls).toBe(0);
    context.probes.dispose();
  });
});
describe('sync status integration', () => {
  it('feeds the sync status into the recommendation and blocks sources that are not updating', async () => {
    const fetcher = createControllableFetch();
    const fake = createFakeEnv(true);
    const cache = createProbeCache({ storage: null });

    // 同步状态：alpha 同步失败（即使用户测出它更快，也不该自动推荐）。
    const statuses: Record<string, 'success' | 'failed' | 'unknown'> = {
      alpha: 'failed',
      beta: 'success',
    };

    let monotonic = 100;
    const probes = useMirrorProbes({
      getTargets: () => targets,
      getSyncStatus: (mirrorId) => statuses[mirrorId] ?? 'unknown',
      cache,
      env: fake.env,
      now: () => 1_000,
      scheduler: createProbeScheduler({
        fetchImpl: fetcher.fetchImpl,
        monotonicNow: () => (monotonic += 25),
        epochNow: () => 1_000,
        limits: { attemptsPerTarget: 1 },
      }),
    });

    await flush();
    fetcher.resolveAll();
    await flush();

    const ranked = probes.scores.value;
    const alpha = ranked.find((candidate) => candidate.mirrorId === 'alpha');
    const beta = ranked.find((candidate) => candidate.mirrorId === 'beta');

    expect(alpha).toMatchObject({ sync: 0, excludedBy: 'sync-blocked', eligible: false });
    expect(beta).toMatchObject({ sync: 1, eligible: true });
    expect(probes.recommendedMirrorId.value).toBe('beta');

    probes.dispose();
  });
});

describe('refresh', () => {
  it('clears the old values and their cache records, then measures everything again', async () => {
    const fetcher = createControllableFetch();
    const fake = createFakeEnv(true);
    const cache = createProbeCache({ storage: null });

    // 预置两份 3 小时内的缓存：打开页面时命中它们，一个请求都不发。
    cache.write([{ target: alpha, result: probeResult('alpha', 20, 900) }], 900);
    cache.write([{ target: beta, result: probeResult('beta', 30, 900) }], 900);

    let monotonic = 100;
    const probes = useMirrorProbes({
      getTargets: () => targets,
      cache,
      env: fake.env,
      now: () => 1_000,
      scheduler: createProbeScheduler({
        fetchImpl: fetcher.fetchImpl,
        monotonicNow: () => (monotonic += 25),
        epochNow: () => 1_000,
        limits: { attemptsPerTarget: 1 },
      }),
    });

    await flush();
    expect(probes.viewFor('alpha').result?.durationMs).toBe(20);
    expect(fetcher.calls).toBe(0);

    probes.refresh();

    // 手动重测：旧值立刻消失（占位符 / 测速中）、缓存记录被清掉，重新发起请求。
    expect(probes.viewFor('alpha').result).toBeUndefined();
    expect(cache.read().some((entry) => entry.probeId === 'alpha-robots')).toBe(false);
    expect(fetcher.calls).toBeGreaterThan(0);

    // 这次没测到就保持没有数据：不会把刚才清掉的旧值拿回来。
    fetcher.failAll();
    await flush();
    expect(probes.viewFor('alpha').result?.status).toBe('failed');
    expect(probes.viewFor('alpha').result?.durationMs).toBeNull();
    expect(cache.read().find((entry) => entry.probeId === 'alpha-robots')?.ok).toBeUndefined();

    probes.dispose();
  });
});
