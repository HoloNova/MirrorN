import type { ProbeResult, ProbeTarget } from '@mirrorn/shared/probe';

import type { ProbeAttempt } from './probe';

/**
 * 把一个候选的多次尝试聚合成一条结果。
 *
 * 为什么不是"测一次就上报"：`performance.now()` 包住的是整个 `fetch()`，所以第一个请求里包含
 * DNS / TCP / TLS 建连，耗时天然偏高。跨域资源又拿不到 Resource Timing 的 `connectStart`、
 * `responseStart`（没有 `Timing-Allow-Origin` 时浏览器一律置 0），事后无法把建连时间扣掉。
 * 于是改成同一个候选连续发几次（第二次起复用同一条连接），取**最快两次的平均**：
 * 建连那一次通常正是最慢的一次，会被排除在外；剩下的抖动也被摊平，语义也更明确——
 * 这是"连接已经可用时"的耗时，而不是冷启动耗时。
 *
 * 聚合规则只在这里，界面与缓存都只看聚合后的 `durationMs`，所以推荐评分与排序完全不需要
 * 知道尝试了几次。
 */

/** 取最快的几次求平均：2 次是"排除建连那次"与"抵抗单次抖动"之间的折中。 */
export const SAMPLES_FOR_AVERAGE = 2;

function isMeasured(result: ProbeResult): boolean {
  return result.status === 'ok' && result.durationMs !== null;
}

function meanDuration(results: ProbeResult[]): number {
  const total = results.reduce((sum, result) => sum + (result.durationMs ?? 0), 0);
  return Math.round(total / results.length);
}

export function aggregateAttempts(target: ProbeTarget, attempts: ProbeAttempt[]): ProbeAttempt {
  const collected: ProbeResult[] = [];
  for (const attempt of attempts) {
    // 取消是整轮的决定：只要有一次是被取消的，这个候选就不产生结果（也不写缓存）。
    if (attempt.outcome === 'cancelled') {
      return { outcome: 'cancelled' };
    }
    collected.push(attempt.result);
  }

  // 调用方不会传空数组；真出现时按"没有结果"处理，而不是编一条出来。
  if (collected.length === 0) {
    return { outcome: 'cancelled' };
  }

  const measuredAt = Math.max(...collected.map((result) => result.measuredAt));
  const samples = collected.filter(isMeasured).length;
  const meta = { measuredAt, attempts: collected.length, samples };

  if (samples === 0) {
    // 一次都没拿到数值：只有全部超时才叫超时，否则按失败上报（失败可能带着状态码）。
    const timedOut = collected.every((result) => result.status === 'timeout');
    const last = collected[collected.length - 1];
    const httpStatus = last?.httpStatus;

    return {
      outcome: 'result',
      result: {
        mirrorId: target.mirrorId,
        probeId: target.probe.id,
        status: timedOut ? 'timeout' : 'failed',
        durationMs: null,
        mode: target.probe.mode,
        opaque: false,
        ...(httpStatus === undefined ? {} : { httpStatus }),
        ...meta,
      },
    };
  }

  const ranked = collected
    .filter(isMeasured)
    .sort((left, right) => (left.durationMs ?? 0) - (right.durationMs ?? 0));
  const picked = ranked.slice(0, Math.min(SAMPLES_FOR_AVERAGE, ranked.length));
  // 响应能否读取（opaque / 状态码）与耗时无关，取最快那一次作为代表。
  const reference = picked[0];

  return {
    outcome: 'result',
    result: {
      mirrorId: target.mirrorId,
      probeId: target.probe.id,
      status: 'ok',
      durationMs: meanDuration(picked),
      mode: reference.mode,
      opaque: reference.opaque,
      ...(reference.httpStatus === undefined ? {} : { httpStatus: reference.httpStatus }),
      ...meta,
    },
  };
}
