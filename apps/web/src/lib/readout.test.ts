import { describe, expect, it } from 'vitest';

import type { ProbeResult } from '@mirrorn/shared/probe';

import { presentReadout, READOUT_TIER_THRESHOLDS, tierForDelayScore } from './readout';

const okResult = (durationMs: number | null): ProbeResult => ({
  mirrorId: 'tsinghua',
  probeId: 'tsinghua-robots',
  status: 'ok',
  durationMs,
  measuredAt: 1_700_000_000_000,
  mode: 'cors',
  opaque: false,
});

describe('tierForDelayScore', () => {
  it('按阈值分成三档，边界值归入更高的一档', () => {
    expect(tierForDelayScore(1)).toBe('fast');
    expect(tierForDelayScore(READOUT_TIER_THRESHOLDS.fast)).toBe('fast');
    expect(tierForDelayScore(READOUT_TIER_THRESHOLDS.fast - 0.01)).toBe('fair');
    expect(tierForDelayScore(READOUT_TIER_THRESHOLDS.fair)).toBe('fair');
    expect(tierForDelayScore(READOUT_TIER_THRESHOLDS.fair - 0.01)).toBe('slow');
    expect(tierForDelayScore(0)).toBe('slow');
  });
});

describe('presentReadout', () => {
  it('测到结果时给出刻度长度与分档，长度与推荐算法同源', () => {
    const readout = presentReadout({
      hasProbe: true,
      pending: false,
      stale: false,
      result: okResult(375),
    });

    // 1500ms 超时下，375ms 正好是 0.75 分（fast 档的下边界）。
    expect(readout.state).toBe('measured');
    expect(readout.score).toBeCloseTo(0.75, 5);
    expect(readout.tier).toBe('fast');
    expect(readout.value).toBe('375');
    expect(readout.unit).toBe(' ms');
  });

  it('耗时超过超时阈值时分数夹到 0，而不是负数', () => {
    const readout = presentReadout({
      hasProbe: true,
      pending: false,
      stale: false,
      result: okResult(4200),
    });

    expect(readout.score).toBe(0);
    expect(readout.tier).toBe('slow');
  });

  it('成功了但没有耗时数值时不画刻度：不编造长度', () => {
    const readout = presentReadout({
      hasProbe: true,
      pending: false,
      stale: false,
      result: okResult(null),
    });

    expect(readout.score).toBeUndefined();
    expect(readout.tier).toBeUndefined();
    expect(readout.state).toBe('untested');
  });

  it('未测过、测试中、超时、失败、无法测量都只给状态词，没有刻度', () => {
    const cases = [
      { input: { hasProbe: true, pending: false, stale: false }, state: 'untested' },
      { input: { hasProbe: true, pending: true, stale: false }, state: 'pending' },
      {
        input: {
          hasProbe: true,
          pending: false,
          stale: false,
          result: { ...okResult(null), status: 'timeout' as const },
        },
        state: 'timeout',
      },
      {
        input: {
          hasProbe: true,
          pending: false,
          stale: false,
          result: { ...okResult(null), status: 'failed' as const },
        },
        state: 'failed',
      },
      {
        input: {
          hasProbe: false,
          pending: false,
          stale: false,
          unavailableReason: 'no-probe' as const,
        },
        state: 'unavailable',
      },
      {
        input: {
          hasProbe: false,
          pending: false,
          stale: false,
          unavailableReason: 'probing-disabled' as const,
        },
        state: 'unavailable',
      },
    ];

    for (const item of cases) {
      const readout = presentReadout(item.input);
      expect(readout.state, JSON.stringify(item.input)).toBe(item.state);
      expect(readout.score).toBeUndefined();
      expect(readout.value.length).toBeGreaterThan(0);
    }
  });

  it('结果过期时保留刻度与耗时，同时带上说明', () => {
    const readout = presentReadout({
      hasProbe: true,
      pending: false,
      stale: true,
      result: okResult(300),
    });

    expect(readout.state).toBe('measured');
    expect(readout.value).toBe('300');
    expect(readout.detail).toContain('过期');
  });

  it('超时说明里带上实际的超时阈值', () => {
    const readout = presentReadout({
      hasProbe: true,
      pending: false,
      stale: false,
      result: { ...okResult(null), status: 'timeout' },
      timeoutMs: 2000,
    });

    expect(readout.detail).toContain('2000');
  });
});
