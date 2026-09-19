import type { SyncStatus } from '@mirrorn/shared/sync';

/**
 * tunasync 状态文件解析（纯函数，便于用 fixture 测试）。
 *
 * 端点与字段的核实记录见 `docs/upstream.md`。要点：
 *   - 顶层是数组，每条对应一个上游仓库（`name`）。
 *   - 时间有字符串和 epoch 秒两种；我们只用 `*_ts`（epoch 秒），避免时区解析问题。
 *   - `*_ts` 为 0 表示“从未发生”，按缺省处理，不当作 1970 年。
 *   - 单条记录坏掉只跳过这一条并记诊断，不能因为一条坏记录让整份数据失败。
 */

export interface TunasyncJob {
  name: string;
  status: SyncStatus;
  /** epoch 毫秒。 */
  lastSuccessAt?: number;
  lastAttemptAt?: number;
  nextScheduleAt?: number;
  upstream?: string;
}

export type TunasyncParseOutcome =
  | { ok: true; jobs: TunasyncJob[]; skipped: number; diagnostics: string[] }
  | { ok: false; error: string };

/** 上游取值 → 我们的状态枚举。`fail` 是上游历史拼写，与 `failed` 等价。 */
const STATUS_MAP: Record<string, SyncStatus> = {
  success: 'success',
  syncing: 'syncing',
  failed: 'failed',
  fail: 'failed',
  paused: 'paused',
  unknown: 'unknown',
};

const MAX_DIAGNOSTICS = 10;

function readEpochMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  // 上游给的是 epoch 秒。留一个上界判断：明显不是秒的量级就当作异常值丢掉。
  if (value > 1e12) {
    return undefined;
  }
  return Math.round(value * 1000);
}

export function parseTunasync(payload: unknown): TunasyncParseOutcome {
  if (!Array.isArray(payload)) {
    return { ok: false, error: '响应不是数组，与 tunasync 格式不符' };
  }

  const jobs: TunasyncJob[] = [];
  const diagnostics: string[] = [];
  let skipped = 0;

  const note = (message: string): void => {
    if (diagnostics.length < MAX_DIAGNOSTICS) {
      diagnostics.push(message);
    }
  };

  payload.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      skipped += 1;
      note(`第 ${index} 条不是对象，已跳过`);
      return;
    }

    const record = item as Record<string, unknown>;
    const name = record.name;
    if (typeof name !== 'string' || name.trim() === '') {
      skipped += 1;
      note(`第 ${index} 条缺少有效的 name，已跳过`);
      return;
    }

    const rawStatus = typeof record.status === 'string' ? record.status : '';
    const mapped = STATUS_MAP[rawStatus];
    if (mapped === undefined) {
      note(`作业 ${name} 的状态取值 ${rawStatus === '' ? '(缺失)' : rawStatus} 不认识，按未知处理`);
    }

    const job: TunasyncJob = {
      name,
      status: mapped ?? 'unknown',
    };

    const lastSuccessAt = readEpochMs(record.last_update_ts);
    const lastAttemptAt = readEpochMs(record.last_ended_ts);
    const nextScheduleAt = readEpochMs(record.next_schedule_ts);
    if (lastSuccessAt !== undefined) {
      job.lastSuccessAt = lastSuccessAt;
    }
    if (lastAttemptAt !== undefined) {
      job.lastAttemptAt = lastAttemptAt;
    }
    if (nextScheduleAt !== undefined) {
      job.nextScheduleAt = nextScheduleAt;
    }
    if (typeof record.upstream === 'string' && record.upstream.trim() !== '') {
      job.upstream = record.upstream;
    }

    jobs.push(job);
  });

  return { ok: true, jobs, skipped, diagnostics };
}
