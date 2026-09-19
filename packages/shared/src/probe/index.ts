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
}

export interface ProbeLimits {
  /** 单次请求的超时熔断阈值。 */
  timeoutMs: number;
  /** 每轮最多探测的候选数量。 */
  maxCandidates: number;
  /** 同时进行的请求数量上限。 */
  concurrency: number;
}

/** 默认上限：一轮最多 6 个候选、并发 3、单请求 1500ms。调用处可以覆盖。 */
export const PROBE_LIMITS: ProbeLimits = {
  timeoutMs: 1500,
  maxCandidates: 6,
  concurrency: 3,
};

/** 缓存有效期：15 分钟内视为有效；过期结果仍可展示，但会立即在后台重新探测。 */
export const PROBE_CACHE_TTL_MS = 15 * 60 * 1000;

/** 自动刷新下限：同一批候选 30 秒内不重复自动刷新；手动刷新不受此限制。 */
export const PROBE_MIN_REFRESH_INTERVAL_MS = 30 * 1000;

/** 一个探测目标：镜像 + 该镜像在数据中声明的探针。 */
export interface ProbeTarget {
  mirrorId: string;
  probe: ProbeConfig;
}
