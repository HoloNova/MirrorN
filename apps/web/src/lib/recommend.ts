import { PROBE_LIMITS, type ProbeResult } from '@mirrorn/shared/probe';
import type { SyncStatus } from '@mirrorn/shared/sync';

/**
 * 综合得分权重。MAIN.md 给的是 70/20/10：客户端延迟 70%、镜像站同步状态 20%、
 * 稳定性 10%。这里只做加权求和，不做“保证最快”之类的推断。
 */
export const RECOMMENDATION_WEIGHTS = { delay: 0.7, sync: 0.2, stability: 0.1 } as const;

/**
 * 同步状态来自后端聚合（阶段 5）；拿不到数据时按 `unknown` 处理，界面上显示“未知”，
 * 不把缺失当成成功。
 *
 * `paused`（上游主动暂停同步）与 `failed` 都给 0 分并被排除出自动推荐：两者都意味着
 * 内容当前没有在更新，自动推荐不应该选它；用户仍然可以手动选。
 */
const SYNC_SCORES: Record<SyncStatus, number> = {
  success: 1,
  syncing: 0.5,
  unknown: 0.5,
  paused: 0,
  failed: 0,
};

/**
 * 稳定性项目前对所有来源取同一个中性值：没有实测依据时，不按高校或商业身份
 * 编造可靠性差异。等有真实数据再区分。
 */
export const NEUTRAL_STABILITY = 0.5;

export interface CandidateInput {
  mirrorId: string;
  /** 该候选当前展示的结果，可能来自本轮探测，也可能来自缓存。 */
  result?: ProbeResult;
  /** 结果已过期、正在后台更新：可以展示，但不参与自动推荐。 */
  stale?: boolean;
  syncStatus?: SyncStatus;
  timeoutMs?: number;
}

export type CandidateExclusion = 'no-result' | 'probe-failed' | 'stale' | 'sync-blocked';

export interface CandidateScore {
  mirrorId: string;
  total: number;
  delay: number;
  sync: number;
  stability: number;
  /** 是否参与自动推荐。 */
  eligible: boolean;
  excludedBy?: CandidateExclusion;
}

/** 延迟分：`clamp(1 - durationMs / timeoutMs, 0, 1)`。没有成功结果时为 0。 */
export function delayScore(
  result: ProbeResult | undefined,
  timeoutMs: number = PROBE_LIMITS.timeoutMs,
): number {
  if (!result || result.status !== 'ok' || result.durationMs === null || timeoutMs <= 0) {
    return 0;
  }
  return Math.min(Math.max(1 - result.durationMs / timeoutMs, 0), 1);
}

export function scoreCandidate(input: CandidateInput): CandidateScore {
  const syncStatus = input.syncStatus ?? 'unknown';
  const delay = delayScore(input.result, input.timeoutMs);
  const sync = SYNC_SCORES[syncStatus];
  const stability = NEUTRAL_STABILITY;
  const total =
    delay * RECOMMENDATION_WEIGHTS.delay +
    sync * RECOMMENDATION_WEIGHTS.sync +
    stability * RECOMMENDATION_WEIGHTS.stability;

  let excludedBy: CandidateExclusion | undefined;
  if (!input.result) {
    excludedBy = 'no-result';
  } else if (input.result.status !== 'ok') {
    excludedBy = 'probe-failed';
  } else if (input.stale) {
    excludedBy = 'stale';
  } else if (syncStatus === 'failed' || syncStatus === 'paused') {
    excludedBy = 'sync-blocked';
  }

  return {
    mirrorId: input.mirrorId,
    total,
    delay,
    sync,
    stability,
    eligible: excludedBy === undefined,
    ...(excludedBy === undefined ? {} : { excludedBy }),
  };
}

/**
 * 只影响推荐排序，不改变界面里来源列表的顺序：列表在探测过程中跳动比“顺序最优”更糟。
 * 有可用结果的候选排在前面，平分按稳定 ID 排序，保证同样输入得到同样输出。
 */
export function rankCandidates(inputs: CandidateInput[]): CandidateScore[] {
  return inputs.map(scoreCandidate).sort((left, right) => {
    if (left.eligible !== right.eligible) {
      return left.eligible ? -1 : 1;
    }
    if (left.total !== right.total) {
      return right.total - left.total;
    }
    return left.mirrorId < right.mirrorId ? -1 : left.mirrorId > right.mirrorId ? 1 : 0;
  });
}

/** 自动推荐结果；没有可用候选时返回 undefined，由用户自己选。 */
export function pickRecommended(inputs: CandidateInput[]): string | undefined {
  return rankCandidates(inputs).find((candidate) => candidate.eligible)?.mirrorId;
}
