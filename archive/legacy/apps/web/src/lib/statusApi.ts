import {
  SYNC_CLIENT_TIMEOUT_MS,
  SYNC_STATUSES,
  type MirrorsStatusResponse,
  type NetFingerprintResponse,
  type SyncSourceReport,
  type SyncStatus,
  type SyncStatusRecord,
} from '@mirrorn/shared/sync';

/**
 * 后端同步状态接口的客户端。
 *
 * 三件事必须做到：
 *   1. **快速失败**：页面加载不能等后端；超时就当没有数据（阶段 4 的行为）。
 *   2. **防御性解析**：不引入 zod（浏览器产物里不放校验库），改用逐字段类型检查，
 *      任何不合契约的条目整条丢弃，坏数据只会变成“未知”，不会让页面崩。
 *   3. **静态模式零请求**：`baseUrl` 未配置时调用方根本不会构造客户端（见 useMirrorStatus）。
 */

export interface StatusClientOptions {
  /** API 基地址，例如 `/`（同源）或 `http://127.0.0.1:8787`。 */
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** 失败时的通知回调；默认静默，由调用方决定要不要提示。 */
  onError?: (message: string) => void;
}

export interface StatusClient {
  baseUrl: string;
  fetchMirrors: () => Promise<MirrorsStatusResponse | undefined>;
  fetchFingerprint: () => Promise<NetFingerprintResponse | undefined>;
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}${path}`;
}

function isStatus(value: unknown): value is SyncStatus {
  return typeof value === 'string' && (SYNC_STATUSES as readonly string[]).includes(value);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function parseRecord(value: unknown): SyncStatusRecord | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const mirrorId = readString(record.mirrorId);
  const ecosystemId = readString(record.ecosystemId);
  const sourceUrl = readString(record.sourceUrl);
  if (mirrorId === undefined || ecosystemId === undefined || sourceUrl === undefined) {
    return undefined;
  }
  if (!isStatus(record.status)) {
    return undefined;
  }

  const lastSuccessAt = readNumber(record.lastSuccessAt);
  const lastAttemptAt = readNumber(record.lastAttemptAt);
  const nextScheduleAt = readNumber(record.nextScheduleAt);
  const upstream = readString(record.upstream);
  const job = readString(record.job);

  return {
    mirrorId,
    ecosystemId,
    status: record.status,
    sourceUrl,
    ...(lastSuccessAt === undefined ? {} : { lastSuccessAt }),
    ...(lastAttemptAt === undefined ? {} : { lastAttemptAt }),
    ...(nextScheduleAt === undefined ? {} : { nextScheduleAt }),
    ...(upstream === undefined ? {} : { upstream }),
    ...(job === undefined ? {} : { job }),
  };
}

function parseSourceReport(value: unknown): SyncSourceReport | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const report = value as Record<string, unknown>;
  const url = readString(report.url);
  if (url === undefined || typeof report.ok !== 'boolean') {
    return undefined;
  }

  const fetchedAt = readNumber(report.fetchedAt);
  const recordCount = readNumber(report.recordCount);
  const skipped = readNumber(report.skipped);
  const durationMs = readNumber(report.durationMs);
  const error = readString(report.error);

  return {
    url,
    ok: report.ok,
    ...(fetchedAt === undefined ? {} : { fetchedAt }),
    ...(recordCount === undefined ? {} : { recordCount }),
    ...(skipped === undefined ? {} : { skipped }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(error === undefined ? {} : { error }),
  };
}

/** 顶层结构不对就整体放弃；单条记录不合法只丢那一条。 */
export function parseMirrorsResponse(payload: unknown): MirrorsStatusResponse | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const body = payload as Record<string, unknown>;
  const generatedAt = readNumber(body.generatedAt);
  if (generatedAt === undefined || typeof body.stale !== 'boolean') {
    return undefined;
  }
  if (!Array.isArray(body.items) || !Array.isArray(body.sources)) {
    return undefined;
  }

  const fetchedAt = readNumber(body.fetchedAt);

  return {
    generatedAt,
    stale: body.stale,
    items: body.items
      .map(parseRecord)
      .filter((item): item is SyncStatusRecord => item !== undefined),
    sources: body.sources
      .map(parseSourceReport)
      .filter((item): item is SyncSourceReport => item !== undefined),
    ...(fetchedAt === undefined ? {} : { fetchedAt }),
  };
}

export function parseFingerprintResponse(payload: unknown): NetFingerprintResponse | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const body = payload as Record<string, unknown>;
  if (typeof body.available !== 'boolean') {
    return undefined;
  }
  const computedAt = readNumber(body.computedAt);

  return {
    available: body.available,
    ...(readString(body.fingerprint) === undefined
      ? {}
      : { fingerprint: readString(body.fingerprint)! }),
    computedAt: computedAt ?? Date.now(),
    ...(readString(body.reason) === undefined ? {} : { reason: readString(body.reason)! }),
  };
}

export function createStatusClient(options: StatusClientOptions): StatusClient {
  const timeoutMs = options.timeoutMs ?? SYNC_CLIENT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function requestJson(path: string): Promise<unknown | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(joinUrl(options.baseUrl, path), {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        options.onError?.(`HTTP ${response.status}`);
        return undefined;
      }
      return (await response.json()) as unknown;
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      options.onError?.(aborted ? `请求超过 ${timeoutMs} ms 未完成` : '请求失败');
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    baseUrl: options.baseUrl,
    fetchMirrors: async () => parseMirrorsResponse(await requestJson('/api/mirrors')),
    fetchFingerprint: async () =>
      parseFingerprintResponse(await requestJson('/api/net-fingerprint')),
  };
}

/**
 * 测速开始前等网络指纹的最长时间。
 *
 * 指纹只是一次同源请求（本机后端），正常情况下几十到几百毫秒。但它是**增强**而不是前提：
 * 后端出问题时 `requestJson` 会等满 `SYNC_CLIENT_TIMEOUT_MS`（3 秒），如果测速非要等它，
 * 用户就会看到三秒“测速中”却什么也没发生。所以超过这个上限就直接开测，
 * 代价是这一次的结果不带指纹（拿不到指纹时本来也只能按时间过期）。
 */
export const FINGERPRINT_WAIT_MS = 1_000;

/**
 * 等指纹，但最多等 `timeoutMs`。返回时指纹可能仍然未知。
 *
 * 不做取消：`checkFingerprint` 自己有限频与超时，拿到的结果照旧写回状态，
 * 因此“等超时”不影响后面（若它后来变化，`onFingerprintChange` 仍会作废旧结果）。
 */
export async function waitForFingerprint(
  access: { checkFingerprint: (force?: boolean) => Promise<boolean> },
  timeoutMs: number = FINGERPRINT_WAIT_MS,
): Promise<void> {
  await Promise.race([
    access.checkFingerprint(true).catch(() => false),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
}
