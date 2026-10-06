import { describe, expect, it } from 'vitest';

import { parseTunasync } from './tunasync.js';

/** 取自 2026-09-19 的真实 tunasync.json 记录，字段与取值都按实测保留。 */
const realRecord = {
  name: 'pypi',
  is_master: true,
  status: 'success',
  last_update: '2026-09-19 09:16:39 +0800',
  last_update_ts: 1789760213,
  last_started: '2026-09-19 09:11:49 +0800',
  last_started_ts: 1789759909,
  last_ended: '2026-09-19 09:16:39 +0800',
  last_ended_ts: 1789760213,
  next_schedule: '2026-09-19 21:16:39 +0800',
  next_schedule_ts: 1789803413,
  upstream: 'https://pypi.org',
  size: '1.60T',
};

describe('parseTunasync', () => {
  it('normalizes a real record, converting epoch seconds to milliseconds', () => {
    const outcome = parseTunasync([realRecord]);

    expect(outcome).toEqual({
      ok: true,
      skipped: 0,
      diagnostics: [],
      jobs: [
        {
          name: 'pypi',
          status: 'success',
          lastSuccessAt: 1789760213000,
          lastAttemptAt: 1789760213000,
          nextScheduleAt: 1789803413000,
          upstream: 'https://pypi.org',
        },
      ],
    });
  });

  it('rejects payloads that are not arrays instead of guessing', () => {
    expect(parseTunasync({ status: 'success' })).toEqual({
      ok: false,
      error: '响应不是数组，与 tunasync 格式不符',
    });
    expect(parseTunasync('<!doctype html>')).toEqual({
      ok: false,
      error: '响应不是数组，与 tunasync 格式不符',
    });
  });

  it('maps every upstream spelling we verified, including the legacy `fail`', () => {
    const outcome = parseTunasync([
      { name: 'a', status: 'syncing' },
      { name: 'b', status: 'failed' },
      { name: 'c', status: 'fail' },
      { name: 'd', status: 'paused' },
      { name: 'e', status: 'unknown' },
    ]);

    expect(outcome.ok && outcome.jobs.map((job) => job.status)).toEqual([
      'syncing',
      'failed',
      'failed',
      'paused',
      'unknown',
    ]);
  });

  it('keeps unknown status values as unknown and records a diagnostic', () => {
    const outcome = parseTunasync([{ name: 'pypi', status: 'finished-with-warnings' }]);

    expect(outcome.ok && outcome.jobs[0]?.status).toBe('unknown');
    expect(outcome.ok && outcome.diagnostics).toEqual([
      '作业 pypi 的状态取值 finished-with-warnings 不认识，按未知处理',
    ]);
  });

  it('skips broken records without failing the whole file', () => {
    const outcome = parseTunasync([null, 'nope', { status: 'success' }, realRecord]);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.skipped).toBe(3);
    expect(outcome.jobs.map((job) => job.name)).toEqual(['pypi']);
    expect(outcome.diagnostics).toHaveLength(3);
  });

  it('treats a zero epoch as “never happened” instead of 1970', () => {
    const outcome = parseTunasync([
      { name: 'anaconda', status: 'failed', last_update_ts: 0, last_ended_ts: 1789760213 },
    ]);

    expect(outcome.ok && outcome.jobs[0]).toEqual({
      name: 'anaconda',
      status: 'failed',
      lastAttemptAt: 1789760213000,
    });
  });

  it('drops epoch values that cannot be seconds', () => {
    const outcome = parseTunasync([
      { name: 'pypi', status: 'success', last_update_ts: 1789760213000, next_schedule_ts: -1 },
    ]);

    expect(outcome.ok && outcome.jobs[0]).toEqual({ name: 'pypi', status: 'success' });
  });
});
