import { describe, expect, it } from 'vitest';

import type { ProbeResult } from '@mirrorn/shared/probe';

import {
  delayScore,
  NEUTRAL_STABILITY,
  pickRecommended,
  rankCandidates,
  RECOMMENDATION_WEIGHTS,
  scoreCandidate,
} from './recommend';

function probeResult(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    mirrorId: 'example-mirror',
    probeId: 'example-probe',
    status: 'ok',
    durationMs: 0,
    measuredAt: 1_758_000_000_000,
    mode: 'no-cors',
    opaque: true,
    ...overrides,
  };
}

describe('delayScore', () => {
  it('uses clamp(1 - durationMs / timeoutMs, 0, 1)', () => {
    expect(delayScore(probeResult({ durationMs: 0 }), 1500)).toBe(1);
    expect(delayScore(probeResult({ durationMs: 750 }), 1500)).toBe(0.5);
    expect(delayScore(probeResult({ durationMs: 1500 }), 1500)).toBe(0);
    expect(delayScore(probeResult({ durationMs: 4000 }), 1500)).toBe(0);
  });

  it('gives no delay credit to missing or failed measurements', () => {
    expect(delayScore(undefined)).toBe(0);
    expect(delayScore(probeResult({ status: 'timeout', durationMs: null }))).toBe(0);
    expect(delayScore(probeResult({ status: 'failed', durationMs: null }))).toBe(0);
  });
});

describe('scoreCandidate', () => {
  it('sums the 70/20/10 weights', () => {
    const score = scoreCandidate({ mirrorId: 'a', result: probeResult({ durationMs: 0 }) });

    expect(RECOMMENDATION_WEIGHTS).toEqual({ delay: 0.7, sync: 0.2, stability: 0.1 });
    expect(score.delay).toBe(1);
    expect(score.sync).toBe(0.5);
    expect(score.stability).toBe(NEUTRAL_STABILITY);
    expect(score.total).toBeCloseTo(0.85, 10);
  });

  it('scores sync success, syncing, unknown and failed distinctly', () => {
    const base = { mirrorId: 'a', result: probeResult({ durationMs: 0 }) };

    expect(scoreCandidate({ ...base, syncStatus: 'success' }).sync).toBe(1);
    expect(scoreCandidate({ ...base, syncStatus: 'syncing' }).sync).toBe(0.5);
    expect(scoreCandidate({ ...base, syncStatus: 'unknown' }).sync).toBe(0.5);
    expect(scoreCandidate({ ...base, syncStatus: 'failed' }).sync).toBe(0);
  });

  it('never invents a stability difference between sources', () => {
    const first = scoreCandidate({ mirrorId: 'university-mirror', result: probeResult() });
    const second = scoreCandidate({ mirrorId: 'commercial-mirror', result: probeResult() });

    expect(first.stability).toBe(second.stability);
  });

  it('excludes candidates that have no measurement or an unsuccessful one', () => {
    expect(scoreCandidate({ mirrorId: 'a' })).toMatchObject({
      eligible: false,
      excludedBy: 'no-result',
    });
    expect(
      scoreCandidate({
        mirrorId: 'a',
        result: probeResult({ status: 'timeout', durationMs: null }),
      }),
    ).toMatchObject({ eligible: false, excludedBy: 'probe-failed' });
    expect(
      scoreCandidate({
        mirrorId: 'a',
        result: probeResult({ status: 'failed', durationMs: null, httpStatus: 404 }),
      }),
    ).toMatchObject({ eligible: false, excludedBy: 'probe-failed' });
  });

  it('keeps stale results out of the automatic recommendation', () => {
    expect(scoreCandidate({ mirrorId: 'a', result: probeResult(), stale: true })).toMatchObject({
      eligible: false,
      excludedBy: 'stale',
    });
  });

  it('excludes a fast source whose sync status says the content is not updating', () => {
    expect(
      scoreCandidate({
        mirrorId: 'a',
        result: probeResult({ durationMs: 5 }),
        syncStatus: 'failed',
      }),
    ).toMatchObject({ eligible: false, excludedBy: 'sync-blocked' });

    // paused 同样意味着内容没有在更新，自动推荐不选它（用户仍可手动选择）。
    expect(
      scoreCandidate({
        mirrorId: 'a',
        result: probeResult({ durationMs: 5 }),
        syncStatus: 'paused',
      }),
    ).toMatchObject({ eligible: false, excludedBy: 'sync-blocked' });
  });
});

describe('rankCandidates', () => {
  it('puts eligible candidates first and breaks ties by stable id', () => {
    const ranked = rankCandidates([
      { mirrorId: 'zeta', result: probeResult({ durationMs: 100 }) },
      { mirrorId: 'alpha', result: probeResult({ durationMs: 100 }) },
      { mirrorId: 'beta' },
    ]);

    expect(ranked.map((candidate) => candidate.mirrorId)).toEqual(['alpha', 'zeta', 'beta']);
  });

  it('orders by total score before the id tiebreak', () => {
    const ranked = rankCandidates([
      { mirrorId: 'slow', result: probeResult({ durationMs: 1200 }) },
      { mirrorId: 'fast', result: probeResult({ durationMs: 50 }) },
    ]);

    expect(ranked.map((candidate) => candidate.mirrorId)).toEqual(['fast', 'slow']);
  });

  it('is stable for identical inputs', () => {
    const inputs = [
      { mirrorId: 'b', result: probeResult({ durationMs: 20 }) },
      { mirrorId: 'a', result: probeResult({ durationMs: 20 }) },
    ];

    expect(rankCandidates(inputs).map((candidate) => candidate.mirrorId)).toEqual(
      rankCandidates(inputs).map((candidate) => candidate.mirrorId),
    );
  });
});

describe('pickRecommended', () => {
  it('returns nothing when no candidate has a usable measurement', () => {
    expect(
      pickRecommended([{ mirrorId: 'a' }, { mirrorId: 'b', stale: true, result: probeResult() }]),
    ).toBeUndefined();
  });

  it('picks the fastest eligible candidate', () => {
    expect(
      pickRecommended([
        { mirrorId: 'a', result: probeResult({ durationMs: 400 }) },
        { mirrorId: 'b', result: probeResult({ durationMs: 30 }) },
      ]),
    ).toBe('b');
  });
});
