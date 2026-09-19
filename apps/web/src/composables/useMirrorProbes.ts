import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';

import {
  PROBE_MIN_REFRESH_INTERVAL_MS,
  type ProbeResult,
  type ProbeTarget,
} from '@mirrorn/shared/probe';
import { SYNC_UNKNOWN, type SyncStatus } from '@mirrorn/shared/sync';

import {
  createProbeCache,
  selectCachedResults,
  type CachedProbe,
  type ProbeCacheStore,
} from '../lib/probeCache';
import { createProbeScheduler, type ProbeRound, type ProbeScheduler } from '../lib/probeRound';
import { rankCandidates, type CandidateScore } from '../lib/recommend';

/** 网络变化后等一小段时间再测：切换 Wi-Fi、开关代理会连续触发多个事件。 */
const NETWORK_CHANGE_DEBOUNCE_MS = 800;

export interface ProbeEnv {
  isOnline: () => boolean;
  /** 订阅网络变化与页面重新可见；返回取消订阅函数。 */
  subscribe: (handlers: { onNetworkChange: () => void; onVisible: () => void }) => () => void;
  setTimer: (handler: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
}

/**
 * 只把真正实现了 EventTarget 的对象当成事件源。
 *
 * `navigator.connection` 在部分 WebView / 嵌入式浏览器里存在但不是 EventTarget（没有
 * `addEventListener`）。那种实现下直接调用会在 setup 阶段抛 TypeError，导致整个向导页
 * 渲染失败 —— 页面看起来是白屏，而终端不会有任何报错（报错只在浏览器控制台里）。
 */
function asEventTarget(value: unknown): EventTarget | undefined {
  const candidate = value as EventTarget | undefined;
  return typeof candidate?.addEventListener === 'function' &&
    typeof candidate.removeEventListener === 'function'
    ? candidate
    : undefined;
}

/** 浏览器默认环境：online/offline、connection.change、visibilitychange 与 window focus。 */
export function createBrowserProbeEnv(): ProbeEnv {
  if (typeof window === 'undefined') {
    return {
      isOnline: () => true,
      subscribe: () => () => undefined,
      setTimer: (handler, ms) => setTimeout(handler, ms),
      clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    };
  }

  const connection = asEventTarget(
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { connection?: unknown }).connection,
  );

  return {
    // NetworkInformation 并非所有浏览器都支持；onLine 也只是粗略线索，
    // 因此它只用来决定“要不要发请求”，不用来判断网络质量。
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    subscribe: (handlers) => {
      const onChange = (): void => handlers.onNetworkChange();
      const onVisible = (): void => {
        if (document.visibilityState === 'visible') {
          handlers.onVisible();
        }
      };

      const unsubscribe = (): void => {
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
        window.removeEventListener('focus', onVisible);
        document.removeEventListener('visibilitychange', onVisible);
        connection?.removeEventListener('change', onChange);
      };

      try {
        window.addEventListener('online', onChange);
        window.addEventListener('offline', onChange);
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
        connection?.addEventListener('change', onChange);
      } catch (error) {
        // 注册到一半失败就先撤掉已注册的，避免留下一批没人清理的监听器。
        unsubscribe();
        throw error;
      }

      return unsubscribe;
    },
    setTimer: (handler, ms) => setTimeout(handler, ms),
    clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  };
}

export interface MirrorProbeView {
  mirrorId: string;
  /** 数据里没有该镜像的探针：界面显示“无法测量”，不发请求。 */
  hasProbe: boolean;
  pending: boolean;
  /** 结果已过期，正在后台更新。 */
  stale: boolean;
  result?: ProbeResult;
  /** hasProbe 为 false 时说明原因，用于区分“数据里没探针”和“本次测速不可用”。 */
  unavailableReason?: 'no-probe' | 'probing-disabled';
}

export interface UseMirrorProbesOptions {
  /** 候选来源。没有声明 probe 的镜像不会被探测。 */
  getTargets: () => ProbeTarget[];
  /** 该镜像在**当前生态**下的同步状态；缺失按 unknown 处理。 */
  getSyncStatus?: (mirrorId: string) => SyncStatus;
  cache?: ProbeCacheStore;
  scheduler?: ProbeScheduler;
  env?: ProbeEnv;
  now?: () => number;
  minRefreshIntervalMs?: number;
  /** 创建时是否立刻开始第一轮（默认 true）。 */
  autoStart?: boolean;
}

export interface MirrorProbes {
  viewFor: (mirrorId: string) => MirrorProbeView;
  views: ComputedRef<MirrorProbeView[]>;
  scores: ComputedRef<CandidateScore[]>;
  /** 只在有可用结果时给出；没有可用候选时保持 undefined，由用户自己选。 */
  recommendedMirrorId: ComputedRef<string | undefined>;
  refreshing: Ref<boolean>;
  offline: Ref<boolean>;
  lastMeasuredAt: ComputedRef<number | undefined>;
  /** 手动刷新：绕过自动刷新下限，也不使用缓存里的旧结果。 */
  refresh: () => void;
  /** 自动重新验证：遵守 30 秒下限，用于页面重新可见等场景。 */
  revalidate: () => void;
  /**
   * 作废全部已有结果并立即重测。
   *
   * 用途：出口网络变化（网络指纹变化）后，旧的耗时不代表当前链路，必须清掉缓存重测。
   * 与“换网络”事件不同的是，这里不等防抖：调用方已经做过限频。
   */
  invalidate: () => void;
  dispose: () => void;
}

/**
 * 候选来源的探测状态。这里是界面唯一的数据来源：先展示缓存（含过期结果），
 * 再在后台用同一批候选更新；用户手动选过来源之后，任何时候都不替换他的选择。
 */
export function useMirrorProbes(options: UseMirrorProbesOptions): MirrorProbes {
  const env = options.env ?? createBrowserProbeEnv();
  const now = options.now ?? (() => Date.now());
  const minRefreshIntervalMs = options.minRefreshIntervalMs ?? PROBE_MIN_REFRESH_INTERVAL_MS;
  const cache = options.cache ?? createProbeCache();
  const scheduler = options.scheduler ?? createProbeScheduler();

  const results = ref(new Map<string, CachedProbe>());
  const pending = ref(new Set<string>());
  const refreshing = ref(false);
  const offline = ref(false);

  let currentRound: ProbeRound | undefined;
  let lastAutoRefreshAt: number | undefined;
  let debounceTimer: unknown;

  function targetFor(mirrorId: string): ProbeTarget | undefined {
    return options.getTargets().find((target) => target.mirrorId === mirrorId);
  }

  function cancelCurrentRound(): void {
    currentRound?.cancel();
    currentRound = undefined;
    pending.value = new Set();
    refreshing.value = false;
  }

  function markStale(): void {
    const next = new Map<string, CachedProbe>();
    for (const [mirrorId, entry] of results.value) {
      next.set(mirrorId, { result: entry.result, stale: true });
    }
    results.value = next;
  }

  /** SWR 的第一步：把缓存里能用的结果先渲染出来，过期的也显示，但标记为可能过期。 */
  function applyCachedResults(): void {
    const cached = selectCachedResults(cache.read(), options.getTargets(), now());
    const next = new Map(results.value);

    for (const [mirrorId, entry] of cached) {
      const existing = next.get(mirrorId);
      if (existing && existing.result.measuredAt >= entry.result.measuredAt) {
        continue;
      }
      next.set(mirrorId, entry);
    }

    results.value = next;
  }

  function handleResult(result: ProbeResult): void {
    const target = targetFor(result.mirrorId);
    if (!target || target.probe.id !== result.probeId) {
      // 数据已经换了探针：丢弃旧探针的结果，不拿它冒充当前来源的耗时。
      return;
    }

    const next = new Map(results.value);
    next.set(result.mirrorId, { result, stale: false });
    results.value = next;
    cache.write([{ target, result }], now());
  }

  function run(force: boolean): void {
    if (!env.isOnline()) {
      offline.value = true;
      cancelCurrentRound();
      markStale();
      return;
    }
    offline.value = false;

    const at = now();
    if (
      !force &&
      lastAutoRefreshAt !== undefined &&
      at - lastAutoRefreshAt < minRefreshIntervalMs
    ) {
      return;
    }
    lastAutoRefreshAt = at;

    applyCachedResults();

    // 不取消上一轮：startRound 会复用仍在进行中的同一探针，并让旧轮次的结果失效。
    const round = scheduler.startRound(options.getTargets(), { onResult: handleResult });
    currentRound = round;
    pending.value = new Set(round.targets.map((target) => target.mirrorId));
    refreshing.value = true;
    void round.done.finally(() => {
      if (round.isCurrent()) {
        refreshing.value = false;
        pending.value = new Set();
      }
    });
  }

  function handleNetworkChange(): void {
    // 换了网络，旧耗时不再代表当前链路：废弃结果并防抖后重测。
    results.value = new Map();
    cache.clear();
    cancelCurrentRound();

    if (debounceTimer !== undefined) {
      env.clearTimer(debounceTimer);
    }
    debounceTimer = env.setTimer(() => {
      debounceTimer = undefined;
      run(true);
    }, NETWORK_CHANGE_DEBOUNCE_MS);
  }

  function handleVisible(): void {
    const targets = options.getTargets();
    const cached = selectCachedResults(cache.read(), targets, now());
    const needsRefresh = targets.some((target) => {
      const entry = cached.get(target.mirrorId);
      return entry === undefined || entry.stale;
    });

    if (needsRefresh) {
      run(false);
    }
  }

  const scores = computed<CandidateScore[]>(() =>
    rankCandidates(
      options.getTargets().map((target) => {
        const entry = results.value.get(target.mirrorId);
        return {
          mirrorId: target.mirrorId,
          ...(entry === undefined ? {} : { result: entry.result, stale: entry.stale }),
          syncStatus: options.getSyncStatus?.(target.mirrorId) ?? SYNC_UNKNOWN,
        };
      }),
    ),
  );

  const recommendedMirrorId = computed<string | undefined>(
    () => scores.value.find((candidate) => candidate.eligible)?.mirrorId,
  );

  const lastMeasuredAt = computed<number | undefined>(() => {
    let latest: number | undefined;
    for (const entry of results.value.values()) {
      if (latest === undefined || entry.result.measuredAt > latest) {
        latest = entry.result.measuredAt;
      }
    }
    return latest;
  });

  function viewFor(mirrorId: string): MirrorProbeView {
    const entry = results.value.get(mirrorId);
    const hasProbe = targetFor(mirrorId) !== undefined;
    return {
      mirrorId,
      hasProbe,
      pending: pending.value.has(mirrorId),
      stale: entry?.stale ?? false,
      ...(hasProbe ? {} : { unavailableReason: 'no-probe' as const }),
      ...(entry === undefined ? {} : { result: entry.result }),
    };
  }

  const unsubscribe = env.subscribe({
    onNetworkChange: handleNetworkChange,
    onVisible: handleVisible,
  });

  function dispose(): void {
    unsubscribe();
    if (debounceTimer !== undefined) {
      env.clearTimer(debounceTimer);
      debounceTimer = undefined;
    }
    scheduler.cancelAll();
    currentRound = undefined;
    pending.value = new Set();
    refreshing.value = false;
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose);
  }

  if (options.autoStart !== false) {
    run(false);
  }

  return {
    viewFor,
    views: computed(() => options.getTargets().map((target) => viewFor(target.mirrorId))),
    scores,
    recommendedMirrorId,
    refreshing,
    offline,
    lastMeasuredAt,
    refresh: () => run(true),
    revalidate: () => run(false),
    invalidate: () => {
      results.value = new Map();
      cache.clear();
      cancelCurrentRound();
      run(true);
    },
    dispose,
  };
}

/** 没有测量能力时的替代实现：所有来源都显示“无法测量”，不发起任何请求。 */
function createInertMirrorProbes(options: UseMirrorProbesOptions): MirrorProbes {
  const viewFor = (mirrorId: string): MirrorProbeView => ({
    mirrorId,
    // 这里刻意不写 hasProbe: true：没有测量能力时，“本次无法测量”比“未测试”更诚实。
    hasProbe: false,
    pending: false,
    stale: false,
    unavailableReason: 'probing-disabled',
  });

  return {
    viewFor,
    views: computed(() => options.getTargets().map((target) => viewFor(target.mirrorId))),
    scores: computed(() => []),
    recommendedMirrorId: computed(() => undefined),
    refreshing: ref(false),
    offline: ref(false),
    lastMeasuredAt: computed(() => undefined),
    refresh: () => undefined,
    revalidate: () => undefined,
    invalidate: () => undefined,
    dispose: () => undefined,
  };
}

/**
 * 测速是增强功能：初始化失败（浏览器 API 差异、存储异常等）时退化成“全部无法测量”，
 * 而不是让整个向导页打不开 —— 那正是曾经出现过的一次白屏：`navigator.connection`
 * 在某个浏览器里存在但没有 `addEventListener`，setup 抛错后页面一片空白，终端却毫无提示。
 * 失败原因打到控制台，用户拿到的仍然是可用的向导。
 */
export function createMirrorProbeAccess(options: UseMirrorProbesOptions): MirrorProbes {
  try {
    return useMirrorProbes(options);
  } catch (error) {
    console.error('测速初始化失败，本次访问不做测量：', error);
    return createInertMirrorProbes(options);
  }
}

/** 从镜像数据里挑出可探测的候选。没有 probe 的镜像保持“无法测量”。 */
export function toProbeTargets(
  mirrors: Array<{ id: string; probe?: ProbeTarget['probe'] }>,
): ProbeTarget[] {
  return mirrors
    .filter(
      (mirror): mirror is { id: string; probe: ProbeTarget['probe'] } => mirror.probe !== undefined,
    )
    .map((mirror) => ({ mirrorId: mirror.id, probe: mirror.probe }));
}
