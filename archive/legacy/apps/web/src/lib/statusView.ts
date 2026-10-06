import { SYNC_UNKNOWN, type SyncStatus, type SyncStatusRecord } from '@mirrorn/shared/sync';

/**
 * 同步状态的展示口径集中在这里，界面组件不再自己拼文案。
 *
 * 说明：官方源本身就是上游，不存在“同步”这件事，因此单独一句说明，而不是显示“未知”——
 * 后者会让用户以为是数据缺失。评分上官方源仍按中性处理（见 recommend.ts）。
 */

export type SyncStatusTone = 'ok' | 'pending' | 'bad' | 'muted';

export interface SyncStatusDescription {
  text: string;
  tone: SyncStatusTone;
  /** 补充说明（例如最近成功时间、为什么未知），界面以小字展示。 */
  detail?: string;
}

export interface DescribeSyncStatusInput {
  mirrorId: string;
  /** 数据里该镜像是否声明了状态源。 */
  hasSource: boolean;
  /** 该镜像是否为官方入口。 */
  isOfficial: boolean;
  record?: SyncStatusRecord;
  /** 服务端标记数据可能已过期。 */
  stale?: boolean;
  /** 注入时间格式化，便于测试稳定输出。 */
  formatTime?: (value: number) => string;
}

export function defaultFormatTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export function describeSyncStatus(input: DescribeSyncStatusInput): SyncStatusDescription {
  const formatTime = input.formatTime ?? defaultFormatTime;

  if (input.isOfficial) {
    return {
      text: '官方源',
      tone: 'muted',
      detail: '官方源就是上游本身，没有“同步”这一步。',
    };
  }

  if (!input.hasSource) {
    return {
      text: '同步状态未知',
      tone: 'muted',
      detail: '该镜像没有公开可核实的同步状态接口，无法判断内容新鲜度。',
    };
  }

  const record = input.record;
  if (!record) {
    return {
      text: '同步状态未知',
      tone: 'muted',
      detail: '尚未取得该来源的同步状态。',
    };
  }

  const successDetail =
    record.lastSuccessAt === undefined
      ? undefined
      : `最近一次同步成功：${formatTime(record.lastSuccessAt)}`;
  const staleNote = input.stale ? '同步数据可能已过期。' : undefined;
  const detail = [successDetail, staleNote].filter((part): part is string => part !== undefined);

  const status: SyncStatus = record.status;
  const base: Record<SyncStatus, SyncStatusDescription> = {
    success: { text: '已同步', tone: 'ok' },
    syncing: { text: '同步中', tone: 'pending' },
    failed: { text: '同步失败', tone: 'bad' },
    paused: { text: '同步已暂停', tone: 'bad' },
    unknown: { text: '同步状态未知', tone: 'muted' },
  };

  const description = base[status];
  return detail.length === 0 ? description : { ...description, detail: detail.join(' ') };
}

/** 取状态值，缺失一律按 unknown：不把“没有数据”当成成功。 */
export function statusOf(record: SyncStatusRecord | undefined): SyncStatus {
  return record?.status ?? SYNC_UNKNOWN;
}

/** 该状态是否应该阻止自动推荐（内容当前没有在更新）。 */
export function isSyncBlocking(status: SyncStatus): boolean {
  return status === 'failed' || status === 'paused';
}
