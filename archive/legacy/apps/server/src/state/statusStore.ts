import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  MirrorsStatusResponseSchema,
  type MirrorsStatusResponse,
  type SyncSourceReport,
} from '@mirrorn/shared';
import {
  SYNC_FETCH_TIMEOUT_MS,
  SYNC_INTERVAL_MS,
  SYNC_MAX_RESPONSE_BYTES,
  SYNC_STALE_AFTER_MS,
  SYNC_UNKNOWN,
  type SyncStatusRecord,
} from '@mirrorn/shared/sync';

import { fetchJson } from '../upstream/fetchJson.js';
import { parseTunasync, type TunasyncJob } from '../upstream/tunasync.js';
import type { StatusSourceDefinition } from '../upstream/statusSources.js';

/**
 * 上游同步状态的持有者：负责抓取、归一化、内存替换、原子快照与过期标记。
 *
 * 行为约定（PLAN 5.2）：
 *   - 每 15 分钟同步一次，绝不重叠执行；
 *   - 只有成功抓取并校验后才替换内存数据；
 *   - 抓取失败保留最近一次成功的数据，但超过 `staleAfterMs` 未成功就把状态降级为“未知”，
 *     不把过期数据伪装成实时状态；
 *   - 快照写入失败只记日志，不影响服务。
 */

const SNAPSHOT_VERSION = 1;

export interface StatusStoreOptions {
  sources: StatusSourceDefinition[];
  snapshotPath?: string;
  intervalMs?: number;
  staleAfterMs?: number;
  fetchTimeoutMs?: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  log?: (message: string) => void;
}

export interface RefreshSummary {
  attempted: number;
  ok: number;
  failed: number;
  skipped: boolean;
}

interface SourceState {
  report: SyncSourceReport;
  /** 最近一次成功抓取得到的作业，按作业名索引。失败时保留，不被清空。 */
  jobs: Map<string, TunasyncJob>;
}

export interface StatusStore {
  read: () => MirrorsStatusResponse;
  refresh: () => Promise<RefreshSummary>;
  loadSnapshot: () => Promise<{ loaded: boolean; reason?: string }>;
  saveSnapshot: () => Promise<{ saved: boolean; reason?: string }>;
  start: () => void;
  stop: () => void;
  hasSources: () => boolean;
}

export function createStatusStore(options: StatusStoreOptions): StatusStore {
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? (() => undefined);
  const intervalMs = options.intervalMs ?? SYNC_INTERVAL_MS;
  const staleAfterMs = options.staleAfterMs ?? SYNC_STALE_AFTER_MS;

  const states = new Map<string, SourceState>(
    options.sources.map((source) => [
      source.url,
      { report: { url: source.url, ok: false }, jobs: new Map<string, TunasyncJob>() },
    ]),
  );

  let lastSuccessAt: number | undefined;
  let refreshing: Promise<RefreshSummary> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  function itemsFromState(stale: boolean): SyncStatusRecord[] {
    const items: SyncStatusRecord[] = [];

    for (const source of options.sources) {
      const state = states.get(source.url);
      if (!state) {
        continue;
      }
      for (const definition of source.jobs) {
        const job = state.jobs.get(definition.job);
        if (!job) {
          continue;
        }
        items.push({
          mirrorId: definition.mirrorId,
          ecosystemId: definition.ecosystemId,
          // 过期数据一律按“未知”上报：不把旧的成功状态伪装成当前状态。
          status: stale ? SYNC_UNKNOWN : job.status,
          ...(job.lastSuccessAt === undefined ? {} : { lastSuccessAt: job.lastSuccessAt }),
          ...(job.lastAttemptAt === undefined ? {} : { lastAttemptAt: job.lastAttemptAt }),
          ...(job.nextScheduleAt === undefined ? {} : { nextScheduleAt: job.nextScheduleAt }),
          ...(job.upstream === undefined ? {} : { upstream: job.upstream }),
          job: definition.job,
          sourceUrl: source.url,
        });
      }
    }

    return items;
  }

  function read(): MirrorsStatusResponse {
    const at = now();
    const stale = lastSuccessAt === undefined || at - lastSuccessAt > staleAfterMs;
    return {
      generatedAt: at,
      ...(lastSuccessAt === undefined ? {} : { fetchedAt: lastSuccessAt }),
      stale,
      items: itemsFromState(stale),
      sources: [...states.values()].map((state) => ({ ...state.report })),
    };
  }

  async function fetchSource(
    source: StatusSourceDefinition,
  ): Promise<{ recordCount: number; jobs: TunasyncJob[] } | { error: string }> {
    if (source.kind !== 'tunasync') {
      return { error: `不支持的状态文件类型：${source.kind}` };
    }

    const outcome = await fetchJson(source.url, {
      timeoutMs: options.fetchTimeoutMs ?? SYNC_FETCH_TIMEOUT_MS,
      maxBytes: options.maxResponseBytes ?? SYNC_MAX_RESPONSE_BYTES,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });

    if (!outcome.ok) {
      return { error: outcome.error };
    }

    const parsed = parseTunasync(outcome.payload);
    if (!parsed.ok) {
      return { error: parsed.error };
    }

    for (const diagnostic of parsed.diagnostics) {
      log(`${source.url}: ${diagnostic}`);
    }

    return { recordCount: parsed.jobs.length - parsed.skipped, jobs: parsed.jobs };
  }

  async function runRefresh(): Promise<RefreshSummary> {
    const at = now();
    let ok = 0;
    let failed = 0;

    for (const source of options.sources) {
      const state = states.get(source.url);
      if (!state) {
        continue;
      }

      const result = await fetchSource(source);

      if ('error' in result) {
        failed += 1;
        state.report = { ...state.report, url: source.url, ok: false, error: result.error };
        log(`${source.url} 同步失败：${result.error}`);
        continue;
      }

      ok += 1;
      state.jobs = new Map(result.jobs.map((job) => [job.name, job]));
      state.report = {
        url: source.url,
        ok: true,
        fetchedAt: at,
        recordCount: result.recordCount,
        skipped: result.jobs.filter((job) => job.status === SYNC_UNKNOWN).length,
      };
    }

    if (ok > 0) {
      lastSuccessAt = at;
    }

    const summary: RefreshSummary = {
      attempted: options.sources.length,
      ok,
      failed,
      skipped: false,
    };

    if (ok > 0) {
      const saved = await saveSnapshot();
      if (!saved.saved) {
        log(`快照写入失败：${saved.reason ?? '未知原因'}`);
      }
    }

    return summary;
  }

  async function refresh(): Promise<RefreshSummary> {
    if (refreshing) {
      // 不重叠执行：并发的调用复用同一次结果。
      const current = await refreshing;
      return { ...current, skipped: true };
    }

    refreshing = runRefresh();
    try {
      return await refreshing;
    } finally {
      refreshing = undefined;
    }
  }

  async function saveSnapshot(): Promise<{ saved: boolean; reason?: string }> {
    const path = options.snapshotPath;
    if (!path) {
      return { saved: false, reason: '未配置快照路径' };
    }

    const payload = {
      version: SNAPSHOT_VERSION,
      response: read(),
    };

    const tempPath = `${path}.tmp`;
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(tempPath, JSON.stringify(payload), 'utf8');
      // 先写临时文件再 rename：要么是完整的新快照，要么是旧的完整快照。
      await rename(tempPath, path);
      return { saved: true };
    } catch (error) {
      return { saved: false, reason: error instanceof Error ? error.message : '写入异常' };
    }
  }

  async function loadSnapshot(): Promise<{ loaded: boolean; reason?: string }> {
    const path = options.snapshotPath;
    if (!path) {
      return { loaded: false, reason: '未配置快照路径' };
    }

    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch {
      return { loaded: false, reason: '没有可用快照' };
    }

    const parsed = MirrorsStatusResponseSchema.safeParse(
      (JSON.parse(raw) as { response?: unknown } | undefined)?.response,
    );
    if (!parsed.success) {
      // 损坏快照直接忽略，退回“全部未知”，不猜内容。
      return { loaded: false, reason: '快照内容不符合契约' };
    }

    const snapshot = parsed.data;
    lastSuccessAt = snapshot.fetchedAt;

    // 快照只保存归一化结果：把 items 放回对应源的作业表，避免重复抓取才能显示。
    for (const source of options.sources) {
      const state = states.get(source.url);
      if (!state) {
        continue;
      }
      const jobs = new Map<string, TunasyncJob>();
      for (const item of snapshot.items) {
        if (item.sourceUrl !== source.url || item.job === undefined) {
          continue;
        }
        jobs.set(item.job, {
          name: item.job,
          status: item.status,
          ...(item.lastSuccessAt === undefined ? {} : { lastSuccessAt: item.lastSuccessAt }),
          ...(item.lastAttemptAt === undefined ? {} : { lastAttemptAt: item.lastAttemptAt }),
          ...(item.nextScheduleAt === undefined ? {} : { nextScheduleAt: item.nextScheduleAt }),
          ...(item.upstream === undefined ? {} : { upstream: item.upstream }),
        });
      }
      state.jobs = jobs;
      const report = snapshot.sources.find((entry) => entry.url === source.url);
      state.report = report ? { ...report } : { url: source.url, ok: false };
    }

    return { loaded: true };
  }

  function start(): void {
    if (timer !== undefined || options.sources.length === 0) {
      return;
    }
    timer = setInterval(() => {
      void refresh();
    }, intervalMs);
    // 不要让定时器拖住进程退出（测试与优雅关闭都依赖这一点）。
    timer.unref?.();
  }

  function stop(): void {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  return {
    read,
    refresh,
    loadSnapshot,
    saveSnapshot,
    start,
    stop,
    hasSources: () => options.sources.length > 0,
  };
}
