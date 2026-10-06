import {
  PROBE_CACHE_TTL_MS,
  PROBE_FAILURE_RETRY_MS,
  PROBE_MODES,
  PROBE_STATUSES,
  type ProbeResult,
  type ProbeStatus,
  type ProbeTarget,
} from '@mirrorn/shared/probe';

import { probeSignature } from './probe';

/** 存储格式版本：结构变化时递增，旧版本数据整体作废，不做迁移。 */
export const PROBE_CACHE_VERSION = 2;
export const PROBE_CACHE_KEY = `mirrorn.probe-cache.v${PROBE_CACHE_VERSION}`;

/** 最多保留的探针结果条数，避免无上限增长。 */
export const PROBE_CACHE_MAX_ENTRIES = 32;
/**
 * 没有成功结果的条目（也就是只剩“最近一次尝试失败”的那些）最多留多久。
 *
 * 成功结果过了 `PROBE_CACHE_TTL_MS` 就等于没有数据，写入时直接丢掉；剩下的失败记录只服务于
 * 失败冷却（`PROBE_FAILURE_RETRY_MS`），留一天足够，也避免 localStorage 无界增长。
 */
export const PROBE_CACHE_ENTRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * 一条缓存记录：**最近一次成功**与**最近一次尝试**分开记。
 *
 * 为什么分开：成功结果只在 `PROBE_CACHE_TTL_MS` 内算数，过期即等于没有数据、不会再被展示；
 * 但“最近一次尝试失败”这件事要单独留下来，否则每次打开页面都会再去试一次不可达的来源（失败冷却）。
 */
export interface ProbeCacheEntry {
  /** 探针 id：条目的身份（键为它）。失败条目没有结果，因此 id 必须单独存。 */
  probeId: string;
  /** 探针签名；与当前数据不一致的条目会被忽略。 */
  signature: string;
  /** 最近一次成功：结果 + 当时的网络指纹 + 过期时刻。 */
  ok?: {
    result: ProbeResult;
    /** 成功那次的网络指纹（服务端网段 HMAC）。缺失表示当时拿不到指纹。 */
    fingerprint?: string;
    expiresAt: number;
  };
  /** 最近一次尝试（成功或失败），用于节流与“本次未成功”的提示。 */
  lastAttempt: {
    status: ProbeStatus;
    at: number;
    durationMs: number | null;
  };
}

export interface ProbeCacheWrite {
  target: ProbeTarget;
  result: ProbeResult;
}

export interface ProbeCacheStore {
  /** 读取结构合法的条目，包含已过期的条目；是否过期由调用方判断。 */
  read: () => ProbeCacheEntry[];
  /** 写入成功结果（失败请用 writeFailure）。 */
  write: (entries: ProbeCacheWrite[], now?: number, fingerprint?: string) => void;
  /** 记录一次失败的尝试：只更新 lastAttempt，不写入数值。 */
  writeFailure: (
    failures: Array<{ target: ProbeTarget; result: ProbeResult }>,
    now?: number,
  ) => void;
  /**
   * 删除这些探针的记录。
   *
   * 用途：手动重测（用户明确要求重新测一遍）之前清掉旧值——否则这次没测到时，旧数字
   * 会在下次读取缓存时重新冒出来，等于把一次失败的尝试又包装成“仍有数据”。
   */
  drop: (probeIds: string[], now?: number) => void;
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
  /** 结果有效期，默认 3 小时。 */
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

  const {
    mirrorId,
    probeId,
    status,
    durationMs,
    measuredAt,
    mode,
    opaque,
    httpStatus,
    attempts,
    samples,
  } = value;
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
  // 尝试次数是可选的（旧版本写入的条目没有它）：有就校验，非法就丢掉整条。
  if (attempts !== undefined && (!isFiniteNumber(attempts) || attempts < 1)) {
    return undefined;
  }
  if (samples !== undefined && (!isFiniteNumber(samples) || samples < 0)) {
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
    ...(attempts === undefined ? {} : { attempts }),
    ...(samples === undefined ? {} : { samples }),
  };
}

function parseEntry(value: unknown): ProbeCacheEntry | undefined {
  if (!isRecord(value) || typeof value.signature !== 'string' || value.signature.length === 0) {
    return undefined;
  }
  const { probeId } = value;
  if (typeof probeId !== 'string' || probeId.length === 0) {
    return undefined;
  }

  const attempt = value.lastAttempt;
  if (!isRecord(attempt)) {
    return undefined;
  }
  const { status, at, durationMs } = attempt;
  if (typeof status !== 'string' || !(PROBE_STATUSES as readonly string[]).includes(status)) {
    return undefined;
  }
  if (!isFiniteNumber(at)) {
    return undefined;
  }
  if (durationMs !== null && durationMs !== undefined && !isFiniteNumber(durationMs)) {
    return undefined;
  }

  const entry: ProbeCacheEntry = {
    probeId,
    signature: value.signature,
    lastAttempt: {
      status: status as ProbeStatus,
      at,
      durationMs: isFiniteNumber(durationMs) ? durationMs : null,
    },
  };

  if (value.ok !== undefined) {
    if (!isRecord(value.ok) || !isFiniteNumber(value.ok.expiresAt)) {
      return undefined;
    }
    const result = parseResult(value.ok.result);
    if (!result) {
      return undefined;
    }
    const fingerprint = value.ok.fingerprint;
    if (fingerprint !== undefined && typeof fingerprint !== 'string') {
      return undefined;
    }
    entry.ok = {
      result,
      expiresAt: value.ok.expiresAt,
      ...(fingerprint === undefined ? {} : { fingerprint }),
    };
  }

  return entry;
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
      merged.set(entry.probeId, entry);
    }
    // 内存条目代表最近一次写入，冲突时以它为准。
    for (const [probeId, entry] of memory) {
      merged.set(probeId, entry);
    }
    return [...merged.values()];
  }

  /**
   * 落盘前的整理：过期的成功结果直接丢掉（过期即没有数据），只剩失败记录的条目按保留上限
   * 丢掉，最后给条数封顶。
   */
  function prune(entries: ProbeCacheEntry[], now: number): ProbeCacheEntry[] {
    const kept: ProbeCacheEntry[] = [];
    for (const entry of entries) {
      const ok = entry.ok !== undefined && entry.ok.expiresAt > now ? entry.ok : undefined;
      if (ok !== undefined) {
        kept.push(ok === entry.ok ? entry : { ...entry, ok });
        continue;
      }
      // 没有有效结果时，只有“最近一次尝试失败”这一条记录还有用（失败冷却）——
      // 其余情况（没成功过、且最近一次尝试也没失败）等于什么都没留下，不占存储。
      const blockedRetry =
        entry.lastAttempt.status !== 'ok' &&
        entry.lastAttempt.at + PROBE_CACHE_ENTRY_MAX_AGE_MS >= now;
      if (blockedRetry) {
        kept.push({
          probeId: entry.probeId,
          signature: entry.signature,
          lastAttempt: entry.lastAttempt,
        });
      }
    }
    return kept.slice(-PROBE_CACHE_MAX_ENTRIES);
  }

  function persist(entries: ProbeCacheEntry[], now: number): void {
    const kept = prune(entries, now);

    if (storage) {
      try {
        storage.setItem(key, JSON.stringify({ version: PROBE_CACHE_VERSION, entries: kept }));
        memory.clear();
        return;
      } catch {
        // 写入失败（配额、被禁用）：落到内存兜底。
      }
    }

    memory.clear();
    for (const entry of kept) {
      memory.set(entry.probeId, entry);
    }
  }

  return {
    read,
    write: (entries, now = Date.now(), fingerprint) => {
      const next = new Map<string, ProbeCacheEntry>();
      for (const existing of read()) {
        next.set(existing.probeId, existing);
      }
      for (const { target, result } of entries) {
        next.set(result.probeId, {
          probeId: result.probeId,
          signature: probeSignature(target),
          ok: {
            result,
            expiresAt: now + ttlMs,
            ...(fingerprint === undefined ? {} : { fingerprint }),
          },
          lastAttempt: {
            status: result.status,
            at: result.measuredAt,
            durationMs: result.durationMs,
          },
        });
      }
      persist([...next.values()], now);
    },
    writeFailure: (failures, now = Date.now()) => {
      const next = new Map<string, ProbeCacheEntry>();
      for (const existing of read()) {
        next.set(existing.probeId, existing);
      }
      for (const { target, result } of failures) {
        const existing = next.get(result.probeId);
        next.set(result.probeId, {
          probeId: result.probeId,
          signature: probeSignature(target),
          // 失败不覆盖 ok：这一条就是要保留上次的耗时。
          ...(existing?.ok === undefined ? {} : { ok: existing.ok }),
          lastAttempt: {
            status: result.status,
            at: result.measuredAt === 0 ? now : result.measuredAt,
            durationMs: result.durationMs,
          },
        });
      }
      persist([...next.values()], now);
    },
    drop: (probeIds, now = Date.now()) => {
      const removing = new Set(probeIds);
      if (removing.size === 0) {
        return;
      }
      persist(
        read().filter((entry) => !removing.has(entry.probeId)),
        now,
      );
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

/** 判断一个候选现在是否需要发起测速。 */
export type MeasureDecision = 'fresh' | 'measure' | 'throttled';

/**
 * 从缓存里挑出当前候选**可展示的数据**，并判断谁需要重测。
 *
 * 数据只有一种：3 小时内（`PROBE_CACHE_TTL_MS`）的成功结果。过了这个期限就等于没有数据——
 * 不再展示、也不参与自动推荐，等下一次测到为止（用户口径：不要拿过期数字顶替）。
 *
 * 规则：
 *   1. 签名不一致（数据换了探针）→ 丢弃；
 *   2. 记录的指纹与当前指纹都已知且不同 → 丢弃（那些数字是在别的网络上测的）；
 *   3. 有成功结果且没过期 → `fresh`，一个请求都不发；
 *   4. 其余情况都要测；但最近一次尝试刚失败过（`retryDelayMs` 冷却内）→ `throttled`，先不重试；
 *   5. 没有数据，而最近一次尝试是失败 → 把那次失败作为状态展示（没有数值，只有“超时 / 失败”）。
 */
export function selectCachedResults(
  entries: ProbeCacheEntry[],
  targets: ProbeTarget[],
  now: number = Date.now(),
  fingerprint?: string,
  retryDelayMs: number = PROBE_FAILURE_RETRY_MS,
): { results: Map<string, ProbeResult>; decisions: Map<string, MeasureDecision> } {
  const expected = new Map(targets.map((target) => [target.probe.id, target]));
  const results = new Map<string, ProbeResult>();
  const decisions = new Map<string, MeasureDecision>();

  // 默认每个候选都要测；下面每读到一条可用缓存就改成 fresh / throttled。
  for (const target of targets) {
    decisions.set(target.mirrorId, 'measure');
  }

  for (const entry of entries) {
    const target = expected.get(entry.probeId);
    if (!target || probeSignature(target) !== entry.signature) {
      continue;
    }

    const recorded = entry.ok?.fingerprint;
    const networkMismatch =
      recorded !== undefined && fingerprint !== undefined && recorded !== fingerprint;
    if (networkMismatch) {
      // 换了网络：这些耗时不代表当前链路，既不展示也不复用。
      continue;
    }

    if (entry.ok && entry.ok.expiresAt > now) {
      results.set(target.mirrorId, entry.ok.result);
      decisions.set(target.mirrorId, 'fresh');
      continue;
    }

    // 没有有效数据：最近一次失败是唯一可展示的信息（只有状态，没有数值）。
    if (entry.lastAttempt.status !== 'ok') {
      results.set(target.mirrorId, {
        mirrorId: target.mirrorId,
        probeId: target.probe.id,
        status: entry.lastAttempt.status,
        durationMs: entry.lastAttempt.durationMs,
        measuredAt: entry.lastAttempt.at,
        mode: target.probe.mode,
        opaque: target.probe.mode === 'no-cors',
      });
      decisions.set(
        target.mirrorId,
        now - entry.lastAttempt.at < retryDelayMs ? 'throttled' : 'measure',
      );
    }
  }

  return { results, decisions };
}
