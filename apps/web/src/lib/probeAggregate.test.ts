import { describe, expect, it } from 'vitest';

import type { ProbeResult, ProbeStatus, ProbeTarget } from '@mirrorn/shared/probe';

import { aggregateAttempts } from './probeAggregate';
import type { ProbeAttempt } from './probe';

const target: ProbeTarget = {
  mirrorId: 'tsinghua',
  probe: {
    id: 'tuna-robots',
    url: 'https://mirrors.tuna.tsinghua.edu.cn/robots.txt',
    mode: 'no-cors',
    method: 'get',
    cacheBust: false,
  },
};

function base(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    mirrorId: target.mirrorId,
    probeId: target.probe.id,
    status: 'ok',
    durationMs: 100,
    measuredAt: 1_000,
    mode: 'no-cors',
    opaque: true,
    ...overrides,
  };
}

function ok(durationMs: number, measuredAt = 1_000): ProbeAttempt {
  return { outcome: 'result', result: base({ durationMs, measuredAt }) };
}

function bad(status: ProbeStatus, measuredAt = 1_000, httpStatus?: number): ProbeAttempt {
  return {
    outcome: 'result',
    result: base({
      status,
      durationMs: null,
      measuredAt,
      opaque: false,
      ...(httpStatus === undefined ? {} : { httpStatus }),
    }),
  };
}

/** 取出聚合后的结果；不是结果就抛错，避免测试里到处写类型收窄。 */
function resultOf(attempts: ProbeAttempt[]): ProbeResult {
  const aggregated = aggregateAttempts(target, attempts);
  if (aggregated.outcome !== 'result') {
    throw new Error(`期望得到结果，实际是 ${aggregated.outcome}`);
  }
  return aggregated.result;
}

describe('aggregateAttempts', () => {
  it('取最快两次的平均，把建连那一次排除在外', () => {
    // 第一次包含 DNS/TCP/TLS，明显更慢；后两次复用连接。平均值应当忽略 420ms。
    const result = resultOf([ok(420, 1_000), ok(120, 1_200), ok(150, 1_400)]);

    expect(result.status).toBe('ok');
    expect(result.durationMs).toBe(135);
    expect(result.attempts).toBe(3);
    expect(result.samples).toBe(3);
    // 时间戳取最近一次尝试，便于缓存判断“这是不是最新的一轮”。
    expect(result.measuredAt).toBe(1_400);
  });

  it('只有两次拿到数值时用这两次的平均', () => {
    const result = resultOf([ok(300), bad('failed'), ok(100)]);

    expect(result.durationMs).toBe(200);
    expect(result.attempts).toBe(3);
    expect(result.samples).toBe(2);
  });

  it('只有一次拿到数值时保留它，但如实减少样本数', () => {
    const result = resultOf([bad('timeout'), ok(180), bad('timeout')]);

    expect(result.status).toBe('ok');
    expect(result.durationMs).toBe(180);
    expect(result.samples).toBe(1);
  });

  it('一次都没拿到数值：全部超时算超时，否则算失败并保留状态码', () => {
    const timedOut = resultOf([bad('timeout'), bad('timeout')]);
    expect(timedOut.status).toBe('timeout');
    expect(timedOut.durationMs).toBeNull();
    expect(timedOut.samples).toBe(0);

    const failed = resultOf([bad('timeout'), bad('failed', 1_000, 404)]);
    expect(failed.status).toBe('failed');
    expect(failed.httpStatus).toBe(404);
  });

  it('取消优先：只要有一次是被取消的，就不产生结果', () => {
    const aggregated = aggregateAttempts(target, [ok(120), { outcome: 'cancelled' }]);

    expect(aggregated.outcome).toBe('cancelled');
  });

  it('没有尝试时也不编造结果', () => {
    expect(aggregateAttempts(target, []).outcome).toBe('cancelled');
  });

  it('可以读取响应时，opaque 与状态码取自最快的那个样本', () => {
    const result = resultOf([
      {
        outcome: 'result',
        result: base({ durationMs: 300, mode: 'cors', opaque: false, httpStatus: 200 }),
      },
      {
        outcome: 'result',
        result: base({ durationMs: 120, mode: 'cors', opaque: false, httpStatus: 200 }),
      },
    ]);

    expect(result.mode).toBe('cors');
    expect(result.opaque).toBe(false);
    expect(result.httpStatus).toBe(200);
  });
});
