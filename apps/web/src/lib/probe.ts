import {
  PROBE_LIMITS,
  type ProbeResult,
  type ProbeStatus,
  type ProbeTarget,
} from '@mirrorn/shared/probe';

/** cacheBust 用的查询参数名；docs/probe-validation.md 里的实测就是用这个参数验证的。 */
const CACHE_BUST_PARAM = 'v';

export interface ProbeRunOverrides {
  /** 测试注入用的假 fetch。 */
  fetchImpl?: typeof fetch;
  /** 单调时钟，只用于计算耗时。 */
  monotonicNow?: () => number;
  /** 墙上时钟，只用于时间戳。 */
  epochNow?: () => number;
  timeoutMs?: number;
}

export type ProbeAttempt =
  | { outcome: 'result'; result: ProbeResult }
  /** 请求被调用方取消（换了一批候选、组件卸载）。取消不产生结果，也不写入缓存。 */
  | { outcome: 'cancelled' };

/**
 * 探针签名。缓存按它判断"这条结果还算不算同一个探针"：
 * 地址、方式或跨域模式变了，旧结果作废，而不是等 15 分钟过期。
 */
export function probeSignature(target: ProbeTarget): string {
  const { probe } = target;
  return [probe.id, probe.mode, probe.method, probe.cacheBust ? 'bust' : 'cached', probe.url].join(
    '|',
  );
}

function result(
  target: ProbeTarget,
  input: Pick<ProbeResult, 'status' | 'durationMs' | 'measuredAt'> & {
    opaque?: boolean;
    httpStatus?: number;
  },
): ProbeResult {
  return {
    mirrorId: target.mirrorId,
    probeId: target.probe.id,
    status: input.status,
    durationMs: input.durationMs,
    measuredAt: input.measuredAt,
    mode: target.probe.mode,
    // 只有真正收到响应时才有"内容是否可读"这回事；没有响应就不成立。
    opaque: input.opaque ?? false,
    ...(input.httpStatus === undefined ? {} : { httpStatus: input.httpStatus }),
  };
}

/**
 * 执行一次探测。只访问数据里审核过的小资源；cors 模式下拿到响应头就取消正文，
 * 绝不下载大文件。超时用 AbortController 熔断，并把"超时"和"失败"分开：
 * 浏览器里超时抛 TimeoutError、跨域或网络失败抛 TypeError，两者不能用同一种文案。
 */
export async function runProbe(
  target: ProbeTarget,
  signal?: AbortSignal,
  overrides: ProbeRunOverrides = {},
): Promise<ProbeAttempt> {
  const fetchImpl = overrides.fetchImpl ?? globalThis.fetch;
  const monotonicNow = overrides.monotonicNow ?? (() => performance.now());
  const epochNow = overrides.epochNow ?? (() => Date.now());
  const timeoutMs = overrides.timeoutMs ?? PROBE_LIMITS.timeoutMs;
  const startedAt = epochNow();

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = (): void => controller.abort();
  signal?.addEventListener('abort', abortFromCaller);

  const started = monotonicNow();
  try {
    // URL 解析也放在 try 里：数据已经校验过，但这里仍然不允许抛出到调用方。
    const url = new URL(target.probe.url);
    if (target.probe.cacheBust) {
      url.searchParams.set(CACHE_BUST_PARAM, String(startedAt));
    }

    const response = await fetchImpl(url.toString(), {
      mode: target.probe.mode,
      method: target.probe.method,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    const durationMs = Math.max(0, Math.round(monotonicNow() - started));
    const measuredAt = epochNow();

    if (response.type === 'opaque') {
      // no-cors：响应不可读，只能说明请求完成，内容与状态码都未验证。
      return {
        outcome: 'result',
        result: result(target, {
          status: 'ok',
          durationMs,
          measuredAt,
          opaque: true,
        }),
      };
    }

    // cors：拿到响应头就可以丢弃正文，不让资源真正下载完。
    // 测时已经在上面算完了，所以这里既不等待也不影响结果；
    // 正文取消失败（极少数实现里 body/cancel 不标准）只多占一点带宽。
    try {
      void Promise.resolve(response.body?.cancel?.()).catch(() => undefined);
    } catch {
      // 忽略
    }

    // 能读到状态码时，只有 2xx 才算一次成功的响应：404/403 说明审核过的资源已经不对，
    // 这种结果不能拿来推荐。
    const ok = response.ok;
    return {
      outcome: 'result',
      result: result(target, {
        status: ok ? 'ok' : 'failed',
        durationMs: ok ? durationMs : null,
        measuredAt,
        httpStatus: response.status,
      }),
    };
  } catch {
    if (signal?.aborted) {
      return { outcome: 'cancelled' };
    }

    const status: ProbeStatus = timedOut ? 'timeout' : 'failed';
    return {
      outcome: 'result',
      result: result(target, { status, durationMs: null, measuredAt: epochNow() }),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
