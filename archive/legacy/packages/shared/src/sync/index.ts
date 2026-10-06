/**
 * 上游同步状态契约（零运行时依赖）：浏览器与服务端共用同一份类型与常量。
 *
 * 为什么单独一个子路径：前端要用里面的常量做文案与评分（不能把 zod 带进浏览器产物），
 * 服务端要用同一份定义校验上游数据。zod schema 放在主入口，这里只放类型与常量，
 * 与 `@mirrorn/shared/probe` 的处理方式一致。
 */

/**
 * 同步状态。`success` / `syncing` / `failed` / `paused` 是上游实测出现过的取值
 * （清华 tunasync.json 2026-09-19 实测：success 167、failed 9、syncing 5、paused 1），
 * `unknown` 是我们对"上游没给、字段不认识或从未成功"的统一处理。
 */
export const SYNC_STATUSES = ['success', 'syncing', 'failed', 'paused', 'unknown'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SYNC_UNKNOWN: SyncStatus = 'unknown';

/** 上游状态数据的格式类型。目前只有 tunasync 一种，经核实可用。 */
export const SYNC_SOURCE_KINDS = ['tunasync'] as const;
export type SyncSourceKind = (typeof SYNC_SOURCE_KINDS)[number];

/** 一条"镜像 + 生态"粒度的同步状态。 */
export interface SyncStatusRecord {
  mirrorId: string;
  ecosystemId: string;
  status: SyncStatus;
  /** 最近一次同步成功结束的时间（epoch 毫秒）。上游未提供或从未成功时缺省。 */
  lastSuccessAt?: number;
  /** 最近一次同步尝试结束的时间（epoch 毫秒）。 */
  lastAttemptAt?: number;
  /** 下一次计划同步时间（epoch 毫秒）。 */
  nextScheduleAt?: number;
  /** 上游声明的同步来源地址，仅用于展示与诊断。 */
  upstream?: string;
  /** 上游作业名（例如 tunasync 的 `pypi`），便于人工对照。 */
  job?: string;
  /** 数据来自哪个上游文件，对应数据里的 `statusSource.url`。 */
  sourceUrl: string;
}

/** 单个上游源的抓取结果，用于展示数据来源与诊断。 */
export interface SyncSourceReport {
  url: string;
  ok: boolean;
  fetchedAt?: number;
  recordCount?: number;
  /** 被安全忽略的记录数（字段缺失、状态取值不认识等）。 */
  skipped?: number;
  durationMs?: number;
  error?: string;
}

export interface MirrorsStatusResponse {
  /** 本响应的生成时间（epoch 毫秒）。 */
  generatedAt: number;
  /** 最近一次抓取成功的时间；从未成功时缺省。 */
  fetchedAt?: number;
  /** 当前数据是否可能已过期（超过 SYNC_STALE_AFTER_MS 未成功更新）。 */
  stale: boolean;
  items: SyncStatusRecord[];
  sources: SyncSourceReport[];
}

/** 默认同步间隔：每 15 分钟一次（PLAN 5.2）。 */
export const SYNC_INTERVAL_MS = 15 * 60 * 1000;

/** 连续失败多久后把数据标为过期（三次同步周期）。 */
export const SYNC_STALE_AFTER_MS = 45 * 60 * 1000;

/** 抓取上游时的默认限制。 */
export const SYNC_FETCH_TIMEOUT_MS = 10_000;
export const SYNC_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/** 前端请求状态接口的默认超时：必须快速失败，绝不能拖慢页面。 */
export const SYNC_CLIENT_TIMEOUT_MS = 3_000;

/** 前端两次状态刷新的最小间隔（页面重新可见时校验，不做轮询）。 */
export const SYNC_CLIENT_MIN_REFRESH_MS = 60_000;

/** 网络指纹相关常量。 */
export const FINGERPRINT_FIELD = 'fingerprint' as const;

/**
 * `/api/net-fingerprint` 的响应。
 *
 * `available: false` 表示无法给出可信指纹（未配置 secret，或拿不到可靠的客户端地址）。
 * 前端在这种情况必须按阶段 4 的行为工作，不能把它当成“网络没变”。
 */
export interface NetFingerprintResponse {
  available: boolean;
  /** HMAC 后的网段指纹；`available` 为 false 时缺省。 */
  fingerprint?: string;
  computedAt: number;
  /** 不可用原因的简短说明，便于排查，不含原始 IP。 */
  reason?: string;
}
