import { describe, expect, it, vi } from 'vitest';

import type { ProbeResult, ProbeTarget } from '@mirrorn/shared/probe';

import { createProbeScheduler } from './probeRound';

function makeTargets(count: number): ProbeTarget[] {
  return Array.from({ length: count }, (_value, index) => ({
    mirrorId: `mirror-${index}`,
    probe: {
      id: `probe-${index}`,
      url: `https://mirror-${index}.example.com/robots.txt`,
      mode: 'no-cors' as const,
      method: 'get' as const,
      cacheBust: false,
    },
  }));
}

function opaque(durationMs = 10): Response {
  return { type: 'opaque', status: 0, ok: false, body: null, durationMs } as unknown as Response;
}

/** 可以手动放行请求的假 fetch，用来观察并发与取消。 */
function createControllableFetch() {
  const pending: Array<{ url: string; settle: (response?: Response) => void }> = [];
  const aborted: string[] = [];
  let active = 0;
  let maxActive = 0;

  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    active += 1;
    maxActive = Math.max(maxActive, active);

    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      const record = {
        url,
        settle: (response: Response = opaque()) => {
          if (finish()) {
            resolve(response);
          }
        },
      };
      const finish = (): boolean => {
        if (settled) {
          return false;
        }
        settled = true;
        active -= 1;
        const index = pending.indexOf(record);
        if (index >= 0) {
          pending.splice(index, 1);
        }
        return true;
      };

      init?.signal?.addEventListener('abort', () => {
        if (finish()) {
          aborted.push(url);
          reject(new DOMException('aborted', 'AbortError'));
        }
      });

      pending.push(record);
    });
  }) as typeof fetch;

  return {
    fetchImpl,
    pending,
    aborted,
    get activeCount() {
      return active;
    },
    get maxActive() {
      return maxActive;
    },
    resolveNext(response?: Response) {
      pending.shift()?.settle(response);
    },
    urls() {
      return pending.map((item) => item.url);
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createProbeScheduler', () => {
  it('never runs more requests than the concurrency limit', async () => {
    const fetcher = createControllableFetch();
    const scheduler = createProbeScheduler({
      fetchImpl: fetcher.fetchImpl,
      limits: { concurrency: 3, maxCandidates: 6 },
      monotonicNow: () => 0,
      epochNow: () => 1_000,
    });
    const results: ProbeResult[] = [];
    const round = scheduler.startRound(makeTargets(6), {
      onResult: (result) => results.push(result),
    });

    expect(fetcher.pending).toHaveLength(3);
    expect(round.targets).toHaveLength(6);

    while (fetcher.pending.length > 0 && results.length < 6) {
      fetcher.resolveNext();
      await flush();
    }

    expect(await round.done).toHaveLength(6);
    expect(results).toHaveLength(6);
    expect(fetcher.maxActive).toBeLessThanOrEqual(3);
  });

  it('caps the round at the configured number of candidates', async () => {
    const fetcher = createControllableFetch();
    const scheduler = createProbeScheduler({
      fetchImpl: fetcher.fetchImpl,
      limits: { maxCandidates: 2 },
      monotonicNow: () => 0,
      epochNow: () => 0,
    });

    const round = scheduler.startRound(makeTargets(5));
    expect(round.targets.map((target) => target.probe.id)).toEqual(['probe-0', 'probe-1']);

    fetcher.resolveNext();
    fetcher.resolveNext();
    await round.done;

    expect(fetcher.pending).toHaveLength(0);
  });

  it('reuses an in-flight request instead of probing the same target twice', async () => {
    const fetcher = createControllableFetch();
    const scheduler = createProbeScheduler({
      fetchImpl: fetcher.fetchImpl,
      monotonicNow: () => 0,
      epochNow: () => 0,
    });
    const [target] = makeTargets(1);
    if (!target) {
      throw new Error('测试数据缺失');
    }

    const first = vi.fn();
    const second = vi.fn();
    const firstRound = scheduler.startRound([target], { onResult: first });
    expect(fetcher.pending).toHaveLength(1);

    scheduler.startRound([target], { onResult: second });
    expect(fetcher.pending).toHaveLength(1);
    expect(scheduler.inFlightCount()).toBe(1);

    fetcher.resolveNext();
    await firstRound.done;

    // 旧轮次已经被取代，结果只回调给当前的轮次，避免旧结果覆盖新结果。
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('cancels the probes a new round does not need, and drops their results', async () => {
    const fetcher = createControllableFetch();
    const scheduler = createProbeScheduler({
      fetchImpl: fetcher.fetchImpl,
      monotonicNow: () => 0,
      epochNow: () => 0,
    });
    const [first, second] = makeTargets(2);
    if (!first || !second) {
      throw new Error('测试数据缺失');
    }

    const abandoned = vi.fn();
    const firstRound = scheduler.startRound([first, second], { onResult: abandoned });
    expect(fetcher.pending).toHaveLength(2);

    const kept = vi.fn();
    scheduler.startRound([first], { onResult: kept });

    expect(fetcher.aborted).toEqual([second.probe.url]);
    fetcher.resolveNext();
    await flush();
    await firstRound.done;

    expect(abandoned).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it('drops queued requests that were cancelled before they started', async () => {
    const fetcher = createControllableFetch();
    const scheduler = createProbeScheduler({
      fetchImpl: fetcher.fetchImpl,
      limits: { concurrency: 1, maxCandidates: 4 },
      monotonicNow: () => 0,
      epochNow: () => 0,
    });
    const targets = makeTargets(3);

    const round = scheduler.startRound(targets);
    expect(fetcher.pending).toHaveLength(1);

    round.cancel();
    await flush();
    await round.done;

    expect(fetcher.aborted).toHaveLength(1);
    expect(fetcher.pending).toHaveLength(0);
    expect(scheduler.inFlightCount()).toBe(0);
  });

  it('reports nothing after cancelAll', async () => {
    const fetcher = createControllableFetch();
    const scheduler = createProbeScheduler({
      fetchImpl: fetcher.fetchImpl,
      monotonicNow: () => 0,
      epochNow: () => 0,
    });

    const onResult = vi.fn();
    const round = scheduler.startRound(makeTargets(2), { onResult });
    scheduler.cancelAll();
    await flush();

    expect(await round.done).toEqual([]);
    expect(onResult).not.toHaveBeenCalled();
  });
});
