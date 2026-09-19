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
  const active: Array<(response: Response) => void> = [];
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
      const entry = (response: Response): void => {
        if (settle()) {
          resolve(response);
        }
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
      active.shift()?.(opaque);
    },
    resolveAll() {
      while (active.length > 0) {
        this.resolveNext();
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

  it('watches window, document and a real connection event target', () => {
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
          'connection.add:change',
        ]),
      );

      unsubscribe();
      expect(record).toContain('connection.remove:change');
      expect(connection.listenerCount('change')).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ignores a partial navigator.connection instead of throwing during setup', () => {
    // 部分 WebView / 嵌入式浏览器的 navigator.connection 没有 addEventListener。
    // 以前这里会抛 TypeError，让整个向导页白屏，而终端没有任何报错。
    const record: string[] = [];
    vi.stubGlobal('window', createFakeTarget(record, 'window'));
    vi.stubGlobal('document', createFakeTarget(record, 'document', { visibilityState: 'visible' }));
    vi.stubGlobal('navigator', { onLine: true, connection: { effectiveType: '4g' } });
    try {
      const env = createBrowserProbeEnv();
      const unsubscribe = env.subscribe({ onNetworkChange: vi.fn(), onVisible: vi.fn() });

      expect(record.some((entry) => entry.startsWith('connection'))).toBe(false);
      expect(record).toContain('window.add:online');
      expect(unsubscribe).toBeTypeOf('function');
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
        stale: false,
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
      preload?: Array<{ target: ProbeTarget; result: ProbeResult; at: number }>;
    } = {},
  ) {
    const fetcher = createControllableFetch();
    const fake = createFakeEnv(options.online ?? true);
    const cache = createProbeCache({ storage: null });
    const list = options.list ?? targets;

    for (const entry of options.preload ?? []) {
      cache.write([{ target: entry.target, result: entry.result }], entry.at);
    }

    let clock = 1_000;
    let monotonic = 100;
    const probes = useMirrorProbes({
      getTargets: () => list,
      cache,
      env: fake.env,
      now: () => clock,
      minRefreshIntervalMs: 30_000,
      scheduler: createProbeScheduler({
        fetchImpl: fetcher.fetchImpl,
        monotonicNow: () => (monotonic += 25),
        epochNow: () => clock,
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
    };
  }

  it('renders a cached measurement immediately and still revalidates it', async () => {
    const context = setup({
      preload: [{ target: alpha, result: probeResult('alpha', 42), at: 1_000 }],
    });

    // SWR：缓存立刻可读，同时后台已经在更新同一批候选。
    expect(context.probes.viewFor('alpha').result?.durationMs).toBe(42);
    expect(context.fetcher.activeCount).toBe(2);

    context.fetcher.resolveAll();
    await flush();

    // 缓存里的 42 ms 被本轮结果替换（假时钟每个请求走两次，所以是 25 + 25）。
    expect(context.probes.viewFor('alpha').result?.durationMs).toBe(50);
    expect(context.probes.viewFor('alpha').stale).toBe(false);
    expect(context.probes.lastMeasuredAt.value).toBe(1_000);
    context.probes.dispose();
  });

  it('does not auto-refresh again within the 30 second floor', async () => {
    const context = setup();
    expect(context.fetcher.calls).toBe(2);
    context.fetcher.resolveAll();
    await flush();

    context.probes.revalidate();
    await flush();
    expect(context.fetcher.calls).toBe(2);

    context.advanceClock(30_001);
    context.probes.revalidate();
    await flush();
    expect(context.fetcher.calls).toBe(4);

    context.fetcher.resolveAll();
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

  it('starts no request while offline and discards values from the previous network', async () => {
    const context = setup();
    context.fetcher.resolveAll();
    await flush();
    expect(context.cache.read()).toHaveLength(2);

    context.setOnline(false);
    context.networkChange();
    context.runTimers();
    await flush();

    expect(context.probes.offline.value).toBe(true);
    expect(context.fetcher.calls).toBe(2);
    expect(context.probes.viewFor('alpha').result).toBeUndefined();
    expect(context.cache.read()).toEqual([]);
    context.probes.dispose();
  });

  it('discards results after a network change and re-probes once the events settle', async () => {
    const context = setup();
    context.fetcher.resolveAll();
    await flush();

    context.networkChange();

    expect(context.probes.viewFor('alpha').result).toBeUndefined();
    expect(context.cache.read()).toEqual([]);
    expect(context.fetcher.calls).toBe(2);

    context.runTimers();
    await flush();

    expect(context.fetcher.calls).toBe(4);
    context.fetcher.resolveAll();
    context.probes.dispose();
  });

  it('shows an expired measurement but keeps it out of the automatic recommendation', async () => {
    const context = setup({
      list: [alpha],
      preload: [
        { target: alpha, result: probeResult('alpha', 5), at: 1_000 - PROBE_CACHE_TTL_MS - 1 },
      ],
    });

    expect(context.probes.viewFor('alpha').result?.durationMs).toBe(5);
    expect(context.probes.viewFor('alpha').stale).toBe(true);
    expect(context.probes.recommendedMirrorId.value).toBeUndefined();

    context.fetcher.resolveAll();
    await flush();

    expect(context.probes.viewFor('alpha').stale).toBe(false);
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

    context.advanceClock(16 * 60 * 1000);
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
      stale: false,
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

describe('invalidate', () => {
  it('drops cached and in-flight results and measures again', async () => {
    const fetcher = createControllableFetch();
    const fake = createFakeEnv(true);
    const cache = createProbeCache({ storage: null });

    // 预置一份缓存：invalidate 之后它不应再被展示。
    cache.write([{ target: alpha, result: probeResult('alpha', 20, 900) }], 900);

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
      }),
    });

    await flush();
    // 让首轮结束，这样 invalidate 之后的重新测量就是真实的新请求（而不是复用在途请求）。
    fetcher.resolveAll();
    await flush();
    expect(probes.viewFor('alpha').result).toBeDefined();

    const callsBefore = fetcher.calls;
    probes.invalidate();

    // 旧结果立即消失、缓存被清掉，并立刻发起新一轮测量。
    expect(probes.viewFor('alpha').result).toBeUndefined();
    expect(cache.read()).toEqual([]);
    expect(fetcher.calls).toBeGreaterThan(callsBefore);

    fetcher.resolveAll();
    await flush();
    expect(probes.viewFor('alpha').pending).toBe(false);

    probes.dispose();
  });
});
