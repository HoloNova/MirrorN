import { describe, expect, it } from 'vitest';

import type { SyncStatusRecord } from '@mirrorn/shared/sync';

import { describeSyncStatus, isSyncBlocking, statusOf } from './statusView';

const formatTime = (value: number): string => `T${value}`;

function record(overrides: Partial<SyncStatusRecord> = {}): SyncStatusRecord {
  return {
    mirrorId: 'mirror-a',
    ecosystemId: 'pip',
    status: 'success',
    sourceUrl: 'https://mirror.example/tunasync.json',
    ...overrides,
  };
}

describe('describeSyncStatus', () => {
  it('explains that official sources have no sync step', () => {
    expect(
      describeSyncStatus({ mirrorId: 'pypi-official', hasSource: false, isOfficial: true }),
    ).toEqual({
      text: '官方源',
      tone: 'muted',
      detail: '官方源就是上游本身，没有“同步”这一步。',
    });
  });

  it('says unknown — with a reason — when the mirror publishes nothing', () => {
    const described = describeSyncStatus({
      mirrorId: 'aliyun',
      hasSource: false,
      isOfficial: false,
    });

    expect(described.text).toBe('同步状态未知');
    expect(described.detail).toContain('没有公开可核实的同步状态接口');
  });

  it('distinguishes “declared but not fetched yet” from “nothing published”', () => {
    const described = describeSyncStatus({ mirrorId: 'tuna', hasSource: true, isOfficial: false });

    expect(described.text).toBe('同步状态未知');
    expect(described.detail).toBe('尚未取得该来源的同步状态。');
  });

  it('maps each upstream status to a label and tone', () => {
    const cases: Array<[SyncStatusRecord['status'], string, string]> = [
      ['success', '已同步', 'ok'],
      ['syncing', '同步中', 'pending'],
      ['failed', '同步失败', 'bad'],
      ['paused', '同步已暂停', 'bad'],
      ['unknown', '同步状态未知', 'muted'],
    ];

    for (const [status, text, tone] of cases) {
      expect(
        describeSyncStatus({
          mirrorId: 'mirror-a',
          hasSource: true,
          isOfficial: false,
          record: record({ status }),
          formatTime,
        }),
      ).toMatchObject({ text, tone });
    }
  });

  it('shows the last successful sync time and flags stale data', () => {
    const described = describeSyncStatus({
      mirrorId: 'mirror-a',
      hasSource: true,
      isOfficial: false,
      record: record({ lastSuccessAt: 1234 }),
      stale: true,
      formatTime,
    });

    expect(described).toEqual({
      text: '已同步',
      tone: 'ok',
      detail: '最近一次同步成功：T1234 同步数据可能已过期。',
    });
  });
});

describe('statusOf', () => {
  it('never turns missing data into success', () => {
    expect(statusOf(undefined)).toBe('unknown');
    expect(statusOf(record({ status: 'paused' }))).toBe('paused');
  });
});

describe('isSyncBlocking', () => {
  it('treats failures and pauses as “content is not updating”', () => {
    expect(isSyncBlocking('failed')).toBe(true);
    expect(isSyncBlocking('paused')).toBe(true);
    expect(isSyncBlocking('success')).toBe(false);
    expect(isSyncBlocking('syncing')).toBe(false);
    expect(isSyncBlocking('unknown')).toBe(false);
  });
});
