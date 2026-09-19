import { describe, expect, it } from 'vitest';

import type { ProbeResult } from '@mirrorn/shared/probe';

import { describeProbeView } from './probeView';

function result(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    mirrorId: 'example-mirror',
    probeId: 'example-probe',
    status: 'ok',
    durationMs: 38,
    measuredAt: 1_758_000_000_000,
    mode: 'no-cors',
    opaque: true,
    ...overrides,
  };
}

describe('describeProbeView', () => {
  it('says it cannot measure when the data has no probe', () => {
    const view = describeProbeView({ hasProbe: false, pending: false, stale: false });

    expect(view).toMatchObject({ status: 'unavailable', label: '无法测量', tone: 'neutral' });
    expect(view.detail).toContain('数据里没有');
  });

  it('distinguishes “measurement disabled for this visit” from “no probe in the data”', () => {
    const view = describeProbeView({
      hasProbe: false,
      pending: false,
      stale: false,
      unavailableReason: 'probing-disabled',
    });

    expect(view).toMatchObject({ status: 'unavailable', label: '本次无法测量', tone: 'neutral' });
    expect(view.detail).toContain('测速初始化失败');
    expect(view.detail).not.toContain('数据里没有');
  });

  it('distinguishes testing from never tested', () => {
    expect(describeProbeView({ hasProbe: true, pending: true, stale: false }).label).toBe('测试中');
    expect(describeProbeView({ hasProbe: true, pending: false, stale: false }).label).toBe(
      '未测试',
    );
  });

  it('uses the estimate wording and flags opaque results as unverified', () => {
    const view = describeProbeView({
      hasProbe: true,
      pending: false,
      stale: false,
      result: result(),
    });

    expect(view.label).toBe('响应耗时（估算） 38 ms');
    expect(view.detail).toBe('响应完成，内容未验证');
    expect(view.tone).toBe('good');
  });

  it('shows the readable status code when the response could be read', () => {
    const view = describeProbeView({
      hasProbe: true,
      pending: false,
      stale: false,
      result: result({ mode: 'cors', opaque: false, httpStatus: 200 }),
    });

    expect(view.detail).toBe('响应完成，HTTP 200');
  });

  it('explains a timeout without claiming the site is down', () => {
    const view = describeProbeView({
      hasProbe: true,
      pending: false,
      stale: false,
      result: result({ status: 'timeout', durationMs: null, opaque: false }),
    });

    expect(view.label).toBe('超时');
    expect(view.detail).toContain('1500 ms 内没有响应');
    expect(view.detail).toContain('浏览器策略');
  });

  it('reports a failed probe with the status code when there is one', () => {
    expect(
      describeProbeView({
        hasProbe: true,
        pending: false,
        stale: false,
        result: result({
          status: 'failed',
          durationMs: null,
          mode: 'cors',
          opaque: false,
          httpStatus: 404,
        }),
      }).detail,
    ).toBe('对方返回 HTTP 404');

    expect(
      describeProbeView({
        hasProbe: true,
        pending: false,
        stale: false,
        result: result({ status: 'failed', durationMs: null, opaque: false }),
      }).detail,
    ).toBe('请求没有完成，可能是跨域策略或网络原因');
  });

  it('marks a cached result as possibly outdated', () => {
    const view = describeProbeView({
      hasProbe: true,
      pending: false,
      stale: true,
      result: result(),
    });

    expect(view.detail).toContain('结果可能已过期');
  });
});
