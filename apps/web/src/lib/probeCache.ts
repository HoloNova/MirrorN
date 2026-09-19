import {
  PROBE_CACHE_TTL_MS,
  PROBE_MODES,
  PROBE_STATUSES,
  type ProbeResult,
  type ProbeTarget,
} from '@mirrorn/shared/probe';

import { probeSignature } from './probe';

/** 存储格式版本：结构变化时递增，旧版本数据整体作废，不做迁移。 */
export const PROBE_CACHE_VERSION = 1;
export const PROBE_CACHE_KEY = `mirrorn.probe-cache.v${PROBE_CACHE_VERSION}`;

/** 最多保留的探针结果条数，避免无上限增长。 */
export const PROBE_CACHE_MAX_ENTRIES = 32;
/** 过期后仍保留一段时间，用于 SWR 先展示再更新；超过就直接丢弃。 */
export const PROBE_CACHE_STALE_LIMIT_MS = 24 * 60 * 60 * 1000;

export interface ProbeCacheEntry {
  /** 探针签名；与当前数据不一致的条目会被忽略。 */
  signature: string;
  result: ProbeResult;
  expiresAt: number;
}

export interface ProbeCacheWrite {
  target: ProbeTarget;
  result: ProbeResult;
}

export interface ProbeCacheStore {
  /** 读取结构合法的条目，包含已过期的条目；是否过期由调用方判断。 */
  read: () => ProbeCacheEntry[];
  write: (entries: ProbeCacheWrite[], now?: number) => void;
  clear: () => void;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface ProbeCacheOptions {
  /** 显式注入的存储，便于测试；传 null 表示只用内存。不传则尝试 localStorage。 */
  storage?: StorageLike | null;
  key?: string;
  /** 结果有效期，默认 15 分钟。 */
  ttlMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** localStorage 里的内容一律当成不可信输入：字段缺失、类型不对或多出字段都直接丢弃该条。 */
function parseResult(value: unknown): ProbeResult | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { mirrorId, probeId, status, durationMs, measuredAt, mode, opaque, httpStatus } = value;
  if (typeof mirrorId !== 'string' || mirrorId.length === 0) {
    return undefined;
  }
  if (typeof probeId !== 'string' || probeId.length === 0) {
    return undefined;
  }
  if (typeof status !== 'string' || !(PROBE_STATUSES as readonly string[]).includes(status)) {
    return undefined;
  }
  if (typeof mode !== 'string' || !(PROBE_MODES as readonly string[]).includes(mode)) {
    return undefined;
  }
  if (typeof opaque !== 'boolean' || !isFiniteNumber(measuredAt)) {
    return undefined;
  }
  if (durationMs !== null && !isFiniteNumber(durationMs)) {
    return undefined;
  }
  if (httpStatus !== undefined && !isFiniteNumber(httpStatus)) {
    return undefined;
  }

  return {
    mirrorId,
    probeId,
    status: status as ProbeResult['status'],
    durationMs: durationMs as number | null,
    measuredAt,
    mode: mode as ProbeResult['mode'],
    opaque,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  };
}

function parseEntry(value: unknown): ProbeCacheEntry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { signature, expiresAt } = value;
  if (typeof signature !== 'string' || signature.length === 0 || !isFiniteNumber(expiresAt)) {
    return undefined;
  }
  const result = parseResult(value.result);
  if (!result) {
    return undefined;
  }
  return { signature, result, expiresAt };
}

function resolveStorage(explicit: StorageLike | null | undefined): StorageLike | null {
  if (explicit !== undefined) {
    return explicit;
  }
  try {
    const candidate = globalThis.localStorage as StorageLike | undefined;
    if (!candidate) {
      return null;
    }
    // 无痕模式或站点设置可能让写入抛异常，写入一次就能提前发现。
    const probeKey = `${PROBE_CACHE_KEY}.probe`;
    candidate.setItem(probeKey, '1');
    candidate.removeItem(probeKey);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * 探针结果缓存。存储不可用（被禁用、无痕模式、配额异常）时自动退回内存，
 * 内存里的内容与存储内容按探针 ID 合并，避免一次写入失败导致结果整体消失。
 */
export function createProbeCache(options: ProbeCacheOptions = {}): ProbeCacheStore {
  const key = options.key ?? PROBE_CACHE_KEY;
  const ttlMs = options.ttlMs ?? PROBE_CACHE_TTL_MS;
  const storage = resolveStorage(options.storage);
  const memory = new Map<string, ProbeCacheEntry>();

  function readStorage(): ProbeCacheEntry[] | undefined {
    if (!storage) {
      return undefined;
    }

    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      return undefined;
    }
    if (raw === null) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 损坏的 JSON：当作没有缓存，下一次写入会覆盖它。
      return [];
    }

    if (!isRecord(parsed) || parsed.version !== PROBE_CACHE_VERSION) {
      return [];
    }
    if (!Array.isArray(parsed.entries)) {
      return [];
    }

    return parsed.entries
      .map(parseEntry)
      .filter((entry): entry is ProbeCacheEntry => entry !== undefined);
  }

  function read(): ProbeCacheEntry[] {
    const merged = new Map<string, ProbeCacheEntry>();
    for (const entry of readStorage() ?? []) {
      merged.set(entry.result.probeId, entry);
    }
    // 内存条目代表最近一次写入，冲突时以它为准。
    for (const [probeId, entry] of memory) {
      merged.set(probeId, entry);
    }
    return [...merged.values()];
  }

  function persist(entries: ProbeCacheEntry[]): void {
    if (storage) {
      try {
        storage.setItem(key, JSON.stringify({ version: PROBE_CACHE_VERSION, entries }));
        memory.clear();
        return;
      } catch {
        // 写入失败（配额、被禁用）：落到内存兜底。
      }
    }

    memory.clear();
    for (const entry of entries) {
      memory.set(entry.result.probeId, entry);
    }
  }

  return {
    read,
    write: (entries, now = Date.now()) => {
      const next = new Map<string, ProbeCacheEntry>();
      for (const existing of read()) {
        next.set(existing.result.probeId, existing);
      }
      for (const { target, result } of entries) {
        next.set(result.probeId, {
          signature: probeSignature(target),
          result,
          expiresAt: now + ttlMs,
        });
      }

      const kept = [...next.values()]
        .filter((entry) => entry.expiresAt + PROBE_CACHE_STALE_LIMIT_MS >= now)
        .slice(-PROBE_CACHE_MAX_ENTRIES);
      persist(kept);
    },
    clear: () => {
      memory.clear();
      if (!storage) {
        return;
      }
      try {
        storage.removeItem(key);
      } catch {
        // 忽略：清不掉也只会让下一位使用者重新探测。
      }
    },
  };
}

export interface CachedProbe {
  result: ProbeResult;
  /** true 表示已过期，展示时要说清楚，且不参与自动推荐。 */
  stale: boolean;
}

/**
 * 从缓存里挑出当前候选可用的结果：签名不一致、没有探针的候选都被过滤掉。
 * 返回的 map 以镜像 ID 为键，方便界面按来源渲染。
 */
export function selectCachedResults(
  entries: ProbeCacheEntry[],
  targets: ProbeTarget[],
  now: number = Date.now(),
): Map<string, CachedProbe> {
  const expected = new Map(targets.map((target) => [target.probe.id, target]));
  const selected = new Map<string, CachedProbe>();

  for (const entry of entries) {
    const target = expected.get(entry.result.probeId);
    if (!target || probeSignature(target) !== entry.signature) {
      continue;
    }
    selected.set(target.mirrorId, {
      result: entry.result,
      stale: entry.expiresAt <= now,
    });
  }

  return selected;
}
