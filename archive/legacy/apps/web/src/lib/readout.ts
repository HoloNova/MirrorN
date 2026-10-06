import { PROBE_LIMITS } from '@mirrorn/shared/probe';

import { describeProbeView, type ProbeViewInput } from './probeView';
import { delayScore } from './recommend';

/**
 * 把探测状态翻译成读数条需要的形状。
 *
 * 为什么单独一层：文案口径集中在 `probeView.ts`（不能由组件各写一份），而"刻度多长、什么颜色"
 * 是视觉规则：刻度长度直接用推荐算法里的延迟分 `clamp(1 - 耗时 / 超时阈值, 0, 1)`，
 * 所以读数条与"为什么推荐它"永远一致——不会出现条短但标着推荐的情况。
 */

export type ReadoutTier = 'fast' | 'fair' | 'slow';

export type ReadoutState =
  'measured' | 'pending' | 'timeout' | 'failed' | 'untested' | 'unavailable';

/** 分档阈值只用于上色与给词；刻度长度仍然是连续值。 */
export const READOUT_TIER_THRESHOLDS = { fast: 0.75, fair: 0.5 } as const;

/**
 * 刻度轴的上限（毫秒）。
 *
 * 为什么用固定值而不是“本轮最大值”：固定轴让两次测量、两行来源都落在同一把尺上，
 * 可以直接比较；按最大值归一化会让“本轮最快的那条”永远占满刻度，看不出它其实很快。
 * 超出上限的值刻度封顶，右侧仍然显示真实毫秒数。
 */
export const READOUT_AXIS_MAX_MS = 300;

/**
 * 分档的用词。刻意不用「极优/良好/拥塞」这类结论：慢可能是缓存、浏览器调度或对方回源慢，
 * 我们只测到耗时，没有诊断能力。词只描述相对超时上限的位置，且与刻度颜色同源。
 */
export const READOUT_TIER_LABELS: Record<ReadoutTier, string> = {
  fast: '快',
  fair: '一般',
  slow: '偏慢',
};

export function tierForDelayScore(score: number): ReadoutTier {
  if (score >= READOUT_TIER_THRESHOLDS.fast) {
    return 'fast';
  }
  if (score >= READOUT_TIER_THRESHOLDS.fair) {
    return 'fair';
  }
  return 'slow';
}

export interface ReadoutPresentation {
  state: ReadoutState;
  /** 只有测到结果时才有：0–1，按延迟分算出的刻度长度（与推荐算法同源）。 */
  score?: number;
  /** 只有测到结果时才有：0–1，耗时在固定轴（0–300ms）上的位置，用于“所有来源同一条尺”的画法。 */
  axisRatio?: number;
  tier?: ReadoutTier;
  /** 刻度右侧的文字：成功时是毫秒数，其余状态是状态词。 */
  value: string;
  unit?: string;
  /** 只有测到结果时才有：由延迟分推出的分档词（快 / 一般 / 偏慢）。 */
  tierLabel?: string;
  /** 补充说明（HTTP 状态、超时原因、为什么无法测量等）。 */
  detail?: string;
}

export function presentReadout(input: ProbeViewInput): ReadoutPresentation {
  const described = describeProbeView(input);
  const result = input.result;

  // 只有"测到了"才有刻度：durationMs 为 null 时（理论上的成功但没数值）按未测处理，不编造长度。
  if (
    described.status === 'ok' &&
    result?.durationMs !== null &&
    result?.durationMs !== undefined
  ) {
    const score = delayScore(result, input.timeoutMs ?? PROBE_LIMITS.timeoutMs);
    const tier = tierForDelayScore(score);
    return {
      state: 'measured',
      score,
      axisRatio: Math.min(result.durationMs / READOUT_AXIS_MAX_MS, 1),
      tier,
      tierLabel: READOUT_TIER_LABELS[tier],
      value: String(result.durationMs),
      unit: ' ms',
      ...(described.detail === undefined ? {} : { detail: described.detail }),
    };
  }

  return {
    state: described.status === 'ok' ? 'untested' : described.status,
    value: described.label,
    ...(described.detail === undefined ? {} : { detail: described.detail }),
  };
}
