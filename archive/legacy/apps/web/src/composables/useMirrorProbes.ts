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
  type MeasureDecision,
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
 * 浏览器默认环境：online/offline、visibilitychange 与 window focus。
 *
 * 为什么不看 `navigator.connection`：它的 `change` 在 Chromium 里是**网络质量估算**变化就派发
 * （effectiveType / 四舍五入后的 rtt / downlink 任一变就派发，见
 * `third_party/blink/renderer/modules/netinfo/network_information.cc` 的 `ConnectionChange`），
 * 而页面自己与探测产生的流量就会推动它。把它当成“换网”会得到一次无中生有的全量重测。
 * “换了网络”由出口指纹判定（见 `lib/probeCache.ts` 的 `selectCachedResults`）：那是服务端
 * 按网段算的，换网就变、不换网不变，也是 `docs/decisions.md`（阶段 5.4）定的口径。
 *
 * online/offline 仍然要听：那是真实的连通性信号，而且只需用来决定“要不要发请求”。
 * 监听器注册失败（部分 WebView 的 window/document 不完整）时先撤掉已注册的再抛，
 * 由调用方 `createMirrorProbeAccess` 降级成“本次无法测量”，不让整页打不开。
 */
export function createBrowserProbeEnv(): ProbeEnv {
  if (typeof window === 'undefined') {
    return {
      isOnline: () => true,
      subscribe: () => () => undefined,
      setTimer: (handler, ms) => setTimeout(handler, ms),
      clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    };
  }

  return {
    // `onLine` 也只是粗略线索，因此它只用来决定“要不要发请求”，不用来判断网络质量。
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
      };

      try {
        window.addEventListener('online', onChange);
        window.addEventListener('offline', onChange);
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
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
  /**
   * 当前可展示的数据：3 小时内的成功结果，或最近一次失败的记录（只有状态，没有数值）。
   * 过期的成功结果不算数据，不会出现在这里。
   */
  result?: ProbeResult;
  /** hasProbe 为 false 时说明原因，用于区分“数据里没探针”和“本次测速不可用”。 */
  unavailableReason?: 'no-probe' | 'probing-disabled';
}

export interface UseMirrorProbesOptions {
  /** 候选来源。没有声明 probe 的镜像不会被探测。 */
  getTargets: () => ProbeTarget[];
  /** 该镜像在**当前生态**下的同步状态；缺失按 unknown 处理。 */
  getSyncStatus?: (mirrorId: string) => SyncStatus;
  /**
   * 当前网络的指纹（服务端按出口网段算的 HMAC）。
   *
   * 用途：缓存里的耗时是**在某一个网络下**测出来的。指纹变了就说明这些数字不再代表
   * 当前链路，全部作废重测；指纹未知（拿不到 / 静态部署）时无法判断，只能按时间过期。
   */
  getFingerprint?: () => string | undefined;
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
  /**
   * 手动重测：先清掉本轮候选的旧数据与缓存记录，再全部重测。
   *
   * 为什么不清不行：用户明确要求重测时，这次没测到就等于没有数据——不能等下一次读缓存时
   * 又把旧数字（甚至同一个失败记录）拿回来冒充“仍有数据”。绕过自动刷新下限与失败冷却。
   */
  refresh: () => void;
  /** 自动重新验证：遵守 30 秒下限，只测没有有效数据的来源（缓存里 3 小时内的数字不动）。 */
  revalidate: () => void;
  dispose: () => void;
}

/**
 * 候选来源的探测状态。这里是界面唯一的数据来源：
 *   - 只有 3 小时内的成功结果算数据，过期即没有数据（不展示、不参与推荐）；
 *   - 失败的尝试不产生数值，只留下“超时 / 失败”这个状态供界面说明原因；
 *   - 用户手动选过来源之后，任何时候都不替换他的选择。
 */
export function useMirrorProbes(options: UseMirrorProbesOptions): MirrorProbes {
  const env = options.env ?? createBrowserProbeEnv();
  const now = options.now ?? (() => Date.now());
  const minRefreshIntervalMs = options.minRefreshIntervalMs ?? PROBE_MIN_REFRESH_INTERVAL_MS;
  const cache = options.cache ?? createProbeCache();
  const scheduler = options.scheduler ?? createProbeScheduler();

  const results = ref(new Map<string, ProbeResult>());
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

  /**
   * 把缓存里 3 小时内的成功结果读进内存。
   *
   * 返回值是“每个候选现在要不要测”的决定：有数据就一个请求都不发（这正是
   * “不过度测试”的落地点），失败过且还在冷却期内的也先放过。
   */
  function applyCachedResults(): Map<string, MeasureDecision> {
    const { results: cached, decisions } = selectCachedResults(
      cache.read(),
      options.getTargets(),
      now(),
      options.getFingerprint?.(),
    );
    const next = new Map(results.value);

    for (const [mirrorId, entry] of cached) {
      const existing = next.get(mirrorId);
      if (existing && existing.measuredAt >= entry.measuredAt) {
        continue;
      }
      next.set(mirrorId, entry);
    }

    results.value = next;
    return decisions;
  }

  /** 清掉这些来源的内存结果与缓存记录（手动重测的第一步）。 */
  function dropTargets(targets: ProbeTarget[]): void {
    if (targets.length === 0) {
      return;
    }
    const dropping = new Set(targets.map((target) => target.mirrorId));
    const next = new Map(results.value);
    for (const mirrorId of dropping) {
      next.delete(mirrorId);
    }
    results.value = next;
    cache.drop(
      targets.map((target) => target.probe.id),
      now(),
    );
  }

  function handleResult(result: ProbeResult): void {
    const target = targetFor(result.mirrorId);
    if (!target || target.probe.id !== result.probeId) {
      // 数据已经换了探针：丢弃旧探针的结果，不拿它冒充当前来源的耗时。
      return;
    }

    const next = new Map(results.value);
    next.set(result.mirrorId, result);
    results.value = next;

    if (result.status === 'ok') {
      cache.write([{ target, result }], now(), options.getFingerprint?.());
      return;
    }

    // 失败不产生数值：内存里只留这条失败状态（界面显示“超时 / 失败”），
    // 缓存里只记“最近一次尝试失败了”，让下一次自动重试等过冷却期。
    cache.writeFailure([{ target, result }], now());
  }

  /**
   * 起一轮测速。
   *
   * `manual`（手动重测）先把候选的旧数据与缓存清掉，再全部重测：这次没测到就是没数据。
   * 自动路径先看缓存：有 3 小时内数据的候选根本不进这一轮，因此**零请求**。
   */
  function run(mode: 'auto' | 'manual'): void {
    if (!env.isOnline()) {
      // 离线只停止发请求：已有数据照旧展示（它是否还作数由有效期与指纹决定），
      // 界面用 offline 提示原因，等联网后再补测。
      offline.value = true;
      cancelCurrentRound();
      return;
    }
    offline.value = false;

    const at = now();
    const manual = mode === 'manual';
    if (
      !manual &&
      lastAutoRefreshAt !== undefined &&
      at - lastAutoRefreshAt < minRefreshIntervalMs
    ) {
      return;
    }
    lastAutoRefreshAt = at;

    const all = options.getTargets();
    let planned: ProbeTarget[];
    if (manual) {
      dropTargets(all);
      planned = all;
    } else {
      const decisions = applyCachedResults();
      planned = all.filter((target) => decisions.get(target.mirrorId) === 'measure');
    }

    if (planned.length === 0) {
      // 全都有 3 小时内的数据：本轮什么也不发（这就是 3 小时内不重复测速的实现位置）。
      return;
    }

    // 不取消上一轮：startRound 会复用仍在进行中的同一探针，并让旧轮次的结果失效。
    const round = scheduler.startRound(planned, { onResult: handleResult });
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
    // 网络事件（online / offline）不再废弃已有结果与缓存：那会把一次质量抖动变成一次全量重测。
    // “换了网络”由出口指纹判定——指纹变了，`selectCachedResults` 会丢掉那些数字；
    // 页面拿到新指纹时通过 onFingerprintChange 调 refresh()，那时才真的重测。
    if (debounceTimer !== undefined) {
      env.clearTimer(debounceTimer);
    }
    debounceTimer = env.setTimer(() => {
      debounceTimer = undefined;
      run('auto');
    }, NETWORK_CHANGE_DEBOUNCE_MS);
  }

  function handleVisible(): void {
    // 有效期与换网的判断都在 run 里（看缓存决定测谁），这里不做重复判断。
    run('auto');
  }

  const scores = computed<CandidateScore[]>(() =>
    rankCandidates(
      options.getTargets().map((target) => {
        const entry = results.value.get(target.mirrorId);
        return {
          mirrorId: target.mirrorId,
          ...(entry === undefined ? {} : { result: entry }),
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
      if (latest === undefined || entry.measuredAt > latest) {
        latest = entry.measuredAt;
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
      ...(hasProbe ? {} : { unavailableReason: 'no-probe' as const }),
      ...(entry === undefined ? {} : { result: entry }),
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
    run('auto');
  }

  return {
    viewFor,
    views: computed(() => options.getTargets().map((target) => viewFor(target.mirrorId))),
    scores,
    recommendedMirrorId,
    refreshing,
    offline,
    lastMeasuredAt,
    refresh: () => run('manual'),
    revalidate: () => run('auto'),
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
