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

/** 分档阈值只用于上色；刻度长度仍然是连续值。 */
export const READOUT_TIER_THRESHOLDS = { fast: 0.75, fair: 0.5 } as const;

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
  /** 只有测到结果时才有：0–1，直接作为刻度长度的比例。 */
  score?: number;
  tier?: ReadoutTier;
  /** 刻度右侧的文字：成功时是毫秒数，其余状态是状态词。 */
  value: string;
  unit?: string;
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
    return {
      state: 'measured',
      score,
      tier: tierForDelayScore(score),
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
