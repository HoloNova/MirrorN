import {
  PROBE_LIMITS,
  type ProbeLimits,
  type ProbeResult,
  type ProbeTarget,
} from '@mirrorn/shared/probe';

import { runProbe, type ProbeAttempt, type ProbeRunOverrides } from './probe';

export interface ProbeRoundHandlers {
  /** 只在本轮仍是最新的一轮时回调；被新一轮取代后，旧轮次的结果不再回调。 */
  onResult?: (result: ProbeResult) => void;
}

export interface ProbeRound {
  readonly id: number;
  readonly targets: ProbeTarget[];
  /** 是否仍是最新的一轮。 */
  isCurrent: () => boolean;
  /** 取消本轮发起的请求；被取消的结果不会回调，也不写入缓存。 */
  cancel: () => void;
  /** 本轮结束（正常结束或被取代）时返回已经收集到的结果。 */
  readonly done: Promise<ProbeResult[]>;
}

export interface ProbeScheduler {
  startRound: (targets: ProbeTarget[], handlers?: ProbeRoundHandlers) => ProbeRound;
  cancelAll: () => void;
  inFlightCount: () => number;
}

export interface ProbeSchedulerOptions extends ProbeRunOverrides {
  limits?: Partial<ProbeLimits>;
}

/**
 * 探测轮次调度器：负责并发上限、同一探针的请求去重、新一轮取代旧轮次。
 *
 * 两处容易混淆的语义在这里说明：
 * 1. 「同一探针进行中的请求去重」跨轮次生效。新一轮开始时不重复发起已经在跑的探针，
 *    而是复用同一个请求；因此新一轮不会取消自己还要用的请求。
 * 2. 「新一轮取消旧任务」针对的是新一轮不再需要的探针。旧轮次的回调在这一刻失效，
 *    即使它的结果随后才返回，也不会被当成当前结果。
 */
export function createProbeScheduler(options: ProbeSchedulerOptions = {}): ProbeScheduler {
  const limits: ProbeLimits = { ...PROBE_LIMITS, ...options.limits };
  const inFlight = new Map<
    string,
    { promise: Promise<ProbeAttempt>; controller: AbortController }
  >();
  const waiting: Array<() => void> = [];
  let running = 0;
  let roundCounter = 0;
  let currentRound: ProbeRound | undefined;

  /** 并发闸门：超出上限的任务排队，保证任何时刻的请求数不超过 concurrency。 */
  async function withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (running >= limits.concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running += 1;
    try {
      return await task();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  }

  function startRound(targets: ProbeTarget[], handlers: ProbeRoundHandlers = {}): ProbeRound {
    const selected = targets.slice(0, Math.max(0, limits.maxCandidates));
    roundCounter += 1;
    const id = roundCounter;
    const owned = new Set<string>();
    const results: ProbeResult[] = [];
    let finish: (results: ProbeResult[]) => void = () => undefined;
    const done = new Promise<ProbeResult[]>((resolve) => {
      finish = resolve;
    });

    const round: ProbeRound = {
      id,
      targets: selected,
      isCurrent: () => currentRound === round,
      cancel: () => {
        for (const probeId of owned) {
          inFlight.get(probeId)?.controller.abort();
        }
      },
      done,
    };

    // 新一轮不再需要的探针在这里取消；还要用的保留在跑，由下面的循环复用。
    const needed = new Set(selected.map((target) => target.probe.id));
    for (const [probeId, entry] of inFlight) {
      if (!needed.has(probeId)) {
        entry.controller.abort();
      }
    }
    currentRound = round;

    void (async () => {
      await Promise.all(
        selected.map(async (target) => {
          const probeId = target.probe.id;
          // 先把归属登记在本轮，再等待排队：否则排队中的探针在取消时会被漏掉。
          owned.add(probeId);
          let entry = inFlight.get(probeId);

          if (!entry) {
            const controller = new AbortController();
            const promise = withSlot(async (): Promise<ProbeAttempt> => {
              // 排队期间就被取消的探针不再发请求。
              if (controller.signal.aborted) {
                return { outcome: 'cancelled' };
              }
              return runProbe(target, controller.signal, options);
            });
            const started = { promise, controller };
            inFlight.set(probeId, started);
            entry = started;

            const cleanup = (): void => {
              if (inFlight.get(probeId) === started) {
                inFlight.delete(probeId);
              }
            };
            void promise.then(cleanup, cleanup);
          }

          let attempt: ProbeAttempt;
          try {
            attempt = await entry.promise;
          } catch {
            // 单个探针的意外异常只影响它自己，本轮其他候选继续。
            return;
          }

          if (attempt.outcome !== 'result') {
            return;
          }
          if (!round.isCurrent()) {
            return;
          }

          results.push(attempt.result);
          handlers.onResult?.(attempt.result);
        }),
      );
    })().finally(() => {
      finish(results);
    });

    return round;
  }

  return {
    startRound,
    cancelAll: () => {
      currentRound = undefined;
      for (const entry of inFlight.values()) {
        entry.controller.abort();
      }
    },
    inFlightCount: () => inFlight.size,
  };
}
