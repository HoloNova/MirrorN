import type { ProbeConfig } from '../schemas.js';

/**
 * 探测契约：浏览器直接使用这个子路径（`@mirrorn/shared/probe`），因此这里必须保持零运行时依赖。
 * 只用类型和常量，不 import zod；`ProbeConfig` 是纯类型导入，编译后不会留下引用。
 * 一旦这里引入 zod，前端产物会重新变大，见 docs/decisions.md 的体积实测。
 */

/** 跨域方式。这是数据里的审核结论，不在运行时靠"先试 cors 再退回 no-cors"试探：那样会多发一次请求，
 * 第二次的耗时还带着已经建连的偏差。 */
export const PROBE_MODES = ['cors', 'no-cors'] as const;
export type ProbeMode = (typeof PROBE_MODES)[number];

export const PROBE_METHODS = ['head', 'get'] as const;
export type ProbeMethod = (typeof PROBE_METHODS)[number];

/** 结果状态。"未测试"表示没有结果，"测试中"是请求进行中的界面状态，两者都不是结果，也不写入缓存。 */
export const PROBE_STATUSES = ['ok', 'timeout', 'failed'] as const;
export type ProbeStatus = (typeof PROBE_STATUSES)[number];

export interface ProbeResult {
  mirrorId: string;
  probeId: string;
  status: ProbeStatus;
  /**
   * 只有 ok 有值，单位毫秒，来自 `performance.now()` 的差值。
   * 这是"响应耗时（估算）"：受 DNS、TLS、连接复用、缓存和浏览器调度影响，
   * 不等于精确 TCP RTT、TTFB，也不是下载速度。
   */
  durationMs: number | null;
  /** 结果产生时间（epoch 毫秒），用于判断缓存是否过期。 */
  measuredAt: number;
  mode: ProbeMode;
  /** true 表示 no-cors 的 opaque 响应：请求完成，但状态码和正文都无法读取。 */
  opaque: boolean;
  /** 只有能读取响应的 cors 模式才有状态码。 */
  httpStatus?: number;
  /**
   * 这个结果由几次请求聚合而来。缺省表示 1 次（旧缓存，或调用方没有启用多次尝试）。
   *
   * 为什么需要：首个请求包含 DNS/TCP/TLS 建连，耗时天然高于后续请求，只测一次会把
   * 建连开销当成网络质量。多次尝试后取稳定值，同时把尝试次数写进结果，界面才能如实
   * 说明这个数字是怎么来的（见 apps/web/src/lib/probeAggregate.ts）。
   */
  attempts?: number;
  /** 这些尝试里拿到有效耗时的次数。取最快两次平均时，samples 至少是 2。 */
  samples?: number;
}

export interface ProbeLimits {
  /** 单次请求的超时熔断阈值。 */
  timeoutMs: number;
  /** 每轮最多探测的候选数量。 */
  maxCandidates: number;
  /**
   * 同时进行的请求数量上限。一个候选占一个名额，并在名额内连续尝试：
   * 这样任何时刻对外的并发请求数都等于这个上限，与尝试次数无关。
   */
  concurrency: number;
  /** 每个候选连续发起的请求次数（第一次多数会承担建连开销）。 */
  attemptsPerTarget: number;
}

/** 默认上限：一轮最多 6 个候选、并发 3、每个候选尝试 3 次、单请求 1500ms。调用处可以覆盖。 */
export const PROBE_LIMITS: ProbeLimits = {
  timeoutMs: 1500,
  maxCandidates: 6,
  concurrency: 3,
  attemptsPerTarget: 3,
};

/**
 * 一个候选连续失败（超时或请求失败）多少次之后就不再继续尝试，避免对一个不可达的来源
 * 白等满整个超时预算。成功一次即清零。
 */
export const PROBE_CONSECUTIVE_FAILURE_LIMIT = 2;

/**
 * 缓存有效期：3 小时内视为有效，直接复用本地结果、**一个请求也不发**。
 *
 * 为什么是 3 小时而不是几分钟：镜像是别人的服务器，耗时的变化主要来自你这一侧的链路
 * （出口、无线、运营商），而不是对端。同一网络下反复测既没有新信息，又是对第三方的免费流量
 * 与请求压力。过期后仍会展示（见 PROBE_CACHE_STALE_LIMIT_MS），只是不参与自动推荐。
 */
export const PROBE_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

/** 自动刷新下限：同一批候选 30 秒内不重复自动刷新；手动刷新不受此限制。 */
export const PROBE_MIN_REFRESH_INTERVAL_MS = 30 * 1000;

/**
 * 失败后的冷却时间：某来源最近一次测速失败时，这段时间之内不再自动重试它。
 * 失败本身不覆盖已有结果，但重复去试一个不可达的来源会造成一串超时请求。
 * 手动刷新不受此限制（用户明确要求时就该真的重试）。
 */
export const PROBE_FAILURE_RETRY_MS = 10 * 60 * 1000;

/** 一个探测目标：镜像 + 该镜像在数据中声明的探针。 */
export interface ProbeTarget {
  mirrorId: string;
  probe: ProbeConfig;
}
