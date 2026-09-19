import { PROBE_LIMITS, type ProbeResult } from '@mirrorn/shared/probe';

/**
 * 探测状态在界面上的文案。集中在这里的原因：
 * 1. 「响应耗时（估算）」这类口径不能由组件各写一份，否则很容易漂回「延迟/RTT/速度」；
 * 2. 状态只有三种结果值（ok / timeout / failed），但界面上还要区分未测、测试中、
 *    无法测量和可能过期，这些区分不做成纯函数就没法测试。
 */
export type ProbeTone = 'neutral' | 'good' | 'warn';

export type ProbeViewStatus = 'unavailable' | 'untested' | 'pending' | 'ok' | 'timeout' | 'failed';

export interface ProbeViewLabel {
  status: ProbeViewStatus;
  label: string;
  detail?: string;
  tone: ProbeTone;
}

export interface ProbeViewInput {
  /** 数据里是否声明了该来源的探针。 */
  hasProbe: boolean;
  pending: boolean;
  stale: boolean;
  result?: ProbeResult;
  timeoutMs?: number;
  /**
   * `hasProbe` 为 false 时说明原因：数据里本就没有探针，还是本次访问的测速整体不可用。
   * 两者在界面上必须能分开，否则测速初始化失败会被误报成“数据里没有探针”。
   */
  unavailableReason?: 'no-probe' | 'probing-disabled';
}

export function describeProbeView(input: ProbeViewInput): ProbeViewLabel {
  if (!input.hasProbe) {
    if (input.unavailableReason === 'probing-disabled') {
      return {
        status: 'unavailable',
        label: '本次无法测量',
        detail: '测速初始化失败，原因见浏览器控制台；向导本身仍然可用',
        tone: 'neutral',
      };
    }

    return {
      status: 'unavailable',
      label: '无法测量',
      detail: '数据里没有这个来源的探针，需要你自己判断',
      tone: 'neutral',
    };
  }

  if (input.pending) {
    return { status: 'pending', label: '测试中', tone: 'neutral' };
  }

  const result = input.result;
  if (!result) {
    return { status: 'untested', label: '未测试', tone: 'neutral' };
  }

  const parts: string[] = [];
  if (result.status === 'ok') {
    parts.push(
      result.opaque ? '响应完成，内容未验证' : `响应完成，HTTP ${result.httpStatus ?? '未知'}`,
    );
  } else if (result.status === 'timeout') {
    parts.push(
      `${input.timeoutMs ?? PROBE_LIMITS.timeoutMs} ms 内没有响应；也可能是浏览器策略或网络原因`,
    );
  } else {
    parts.push(
      result.httpStatus === undefined
        ? '请求没有完成，可能是跨域策略或网络原因'
        : `对方返回 HTTP ${result.httpStatus}`,
    );
  }

  if (input.stale) {
    parts.push('结果可能已过期，正在后台更新');
  }

  const detail = parts.join(' · ');

  if (result.status === 'ok') {
    return {
      status: 'ok',
      // 统一口径：这是响应耗时估算，不是 RTT、TTFB，也不是下载速度。
      label: `响应耗时（估算） ${result.durationMs ?? '—'} ms`,
      detail,
      tone: 'good',
    };
  }

  if (result.status === 'timeout') {
    return { status: 'timeout', label: '超时', detail, tone: 'neutral' };
  }

  return { status: 'failed', label: '探测失败', detail, tone: 'warn' };
}
