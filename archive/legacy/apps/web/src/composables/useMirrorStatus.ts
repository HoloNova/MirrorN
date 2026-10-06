import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';

import {
  SYNC_CLIENT_MIN_REFRESH_MS,
  SYNC_UNKNOWN,
  type MirrorsStatusResponse,
  type NetFingerprintResponse,
  type SyncSourceReport,
  type SyncStatus,
  type SyncStatusRecord,
} from '@mirrorn/shared/sync';

import { createStatusClient, type StatusClient } from '../lib/statusApi';

/**
 * 后端同步状态的浏览器侧状态（阶段 5.3/5.4）。
 *
 * 设计取舍：
 *   - **静态模式发零请求**：`baseUrl` 为 undefined 时整个 composable 不构造客户端、不订阅事件。
 *   - **不做轮询**：只在启动和页面重新可见/获得焦点时校验，且有最小间隔；后端有 15 分钟同步周期，
 *     前端密集轮询只会浪费请求。
 *   - **失败即降级**：任何一次请求失败都保留已有数据（可能为空），界面按阶段 4 的行为工作。
 *   - **指纹变化才作废旧测量**：只有先前拿到过指纹且与新值不同才触发回调（首次可用不算变化）。
 */

export interface StatusEnv {
  /** 订阅页面重新可见/获得焦点；返回取消订阅函数。 */
  subscribe: (handlers: { onVisible: () => void }) => () => void;
}

/**
 * 浏览器默认环境：只订阅 `window` / `document`，它们总是完整的 EventTarget。
 *
 * 注意与 `useMirrorProbes` 的区别：那边要碰 `navigator.connection`，它可能**存在但不是
 * EventTarget**（部分 WebView），所以必须做接口完整性检测（只用 `?.` 不够）；
 * `window` / `document` 没有这个问题，所以这里不做额外检测。
 */
export function createBrowserStatusEnv(): StatusEnv {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { subscribe: () => () => undefined };
  }

  return {
    subscribe: (handlers) => {
      const onVisible = (): void => {
        if (document.visibilityState === 'visible') {
          handlers.onVisible();
        }
      };

      const unsubscribe = (): void => {
        window.removeEventListener('focus', onVisible);
        document.removeEventListener('visibilitychange', onVisible);
      };

      try {
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
      } catch (error) {
        unsubscribe();
        throw error;
      }

      return unsubscribe;
    },
  };
}

export type FingerprintState = 'disabled' | 'unknown' | 'available';

export interface MirrorStatusMeta {
  generatedAt?: number;
  fetchedAt?: number;
  stale: boolean;
  sources: SyncSourceReport[];
}

export interface MirrorStatusOptions {
  /**
   * API 基地址（`/` 或绝对地址）。undefined 表示静态模式：完全不请求后端。
   * 默认按 `resolveApiBase()` 从构建期变量推导。
   */
  baseUrl?: string | undefined;
  client?: StatusClient;
  env?: StatusEnv;
  now?: () => number;
  minRefreshIntervalMs?: number;
  /** 指纹变化回调：由向导接到“作废测量结果并重测”。 */
  onFingerprintChange?: () => void;
  /** 请求失败时的通知（默认只打一条控制台警告）。 */
  onError?: (message: string) => void;
  autoStart?: boolean;
}

export interface MirrorStatusAccess {
  enabled: boolean;
  meta: Ref<MirrorStatusMeta>;
  fingerprint: Ref<FingerprintState>;
  /**
   * 最近一次拿到的网络指纹值（服务端网段 HMAC）。未知时为 undefined。
   *
   * 测速缓存要按它判断“这些数字是不是在同一个网络下测的”，因此要能读到具体值，
   * 而不只是 `available / unknown / disabled` 这个状态。
   */
  fingerprintValue: Ref<string | undefined>;
  recordFor: (mirrorId: string, ecosystemId: string) => SyncStatusRecord | undefined;
  statusFor: (mirrorId: string, ecosystemId: string) => SyncStatus;
  refresh: (force?: boolean) => Promise<void>;
  /** 返回指纹是否发生变化（首次拿到不算变化）。 */
  checkFingerprint: (force?: boolean) => Promise<boolean>;
  dispose: () => void;
}

function statusKey(mirrorId: string, ecosystemId: string): string {
  return `${mirrorId}|${ecosystemId}`;
}

/** 按构建期配置推导 API 基地址；未配置时返回 undefined（静态模式）。 */
export function resolveApiBase(
  env: { VITE_API_BASE?: string } | undefined = import.meta.env,
): string | undefined {
  const configured = env?.VITE_API_BASE?.trim();
  if (configured) {
    return configured;
  }
  // 开发时默认同源：vite dev server 会把 /api 代理到本地后端，未启动后端时快速降级。
  return import.meta.env.DEV ? '/' : undefined;
}

export function createMirrorStatusAccess(options: MirrorStatusOptions = {}): MirrorStatusAccess {
  const baseUrl = 'baseUrl' in options ? options.baseUrl : resolveApiBase();
  const now = options.now ?? (() => Date.now());
  const minRefreshIntervalMs = options.minRefreshIntervalMs ?? SYNC_CLIENT_MIN_REFRESH_MS;
  const env = options.env ?? createBrowserStatusEnv();

  const meta = ref<MirrorStatusMeta>({ stale: true, sources: [] });
  const fingerprint = ref<FingerprintState>(baseUrl === undefined ? 'disabled' : 'unknown');
  const fingerprintValue = ref<string | undefined>(undefined);

  if (baseUrl === undefined) {
    // 静态模式：没有任何请求，也不订阅事件。
    return {
      enabled: false,
      meta,
      fingerprint,
      fingerprintValue,
      recordFor: () => undefined,
      statusFor: () => SYNC_UNKNOWN,
      refresh: async () => undefined,
      checkFingerprint: async () => false,
      dispose: () => undefined,
    };
  }

  let warned = false;
  const client =
    options.client ??
    createStatusClient({
      baseUrl,
      onError: (message) => {
        // 只提示一次，避免每次页面切换都重复刷屏。
        if (!warned) {
          warned = true;
          (options.onError ?? ((text: string) => console.warn(`同步状态不可用：${text}`)))(message);
        }
      },
    });

  let records = new Map<string, SyncStatusRecord>();
  let lastFingerprint: string | undefined;
  let lastRefreshAt: number | undefined;
  let lastFingerprintCheckAt: number | undefined;

  function applyResponse(response: MirrorsStatusResponse): void {
    const next = new Map<string, SyncStatusRecord>();
    for (const item of response.items) {
      next.set(statusKey(item.mirrorId, item.ecosystemId), item);
    }
    records = next;
    meta.value = {
      generatedAt: response.generatedAt,
      ...(response.fetchedAt === undefined ? {} : { fetchedAt: response.fetchedAt }),
      stale: response.stale,
      sources: response.sources,
    };
  }

  async function refresh(force = false): Promise<void> {
    const at = now();
    if (!force && lastRefreshAt !== undefined && at - lastRefreshAt < minRefreshIntervalMs) {
      return;
    }
    lastRefreshAt = at;

    const response = await client.fetchMirrors();
    if (response === undefined) {
      // 失败保留已有数据：可能为空，界面按“未知”展示。
      return;
    }
    applyResponse(response);
  }

  async function checkFingerprint(force = false): Promise<boolean> {
    const at = now();
    if (
      !force &&
      lastFingerprintCheckAt !== undefined &&
      at - lastFingerprintCheckAt < minRefreshIntervalMs
    ) {
      return false;
    }
    lastFingerprintCheckAt = at;

    const response: NetFingerprintResponse | undefined = await client.fetchFingerprint();
    if (response === undefined || !response.available || response.fingerprint === undefined) {
      // 不可用时按阶段 4 的策略工作，不假装网络没变。
      fingerprint.value = 'unknown';
      return false;
    }

    fingerprint.value = 'available';
    fingerprintValue.value = response.fingerprint;
    const changed = lastFingerprint !== undefined && lastFingerprint !== response.fingerprint;
    lastFingerprint = response.fingerprint;
    if (changed) {
      options.onFingerprintChange?.();
    }
    return changed;
  }

  const unsubscribe = env.subscribe({
    onVisible: () => {
      void refresh(false);
      void checkFingerprint(false);
    },
  });

  function dispose(): void {
    unsubscribe();
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose);
  }

  if (options.autoStart !== false) {
    void refresh(true);
    void checkFingerprint(true);
  }

  return {
    enabled: true,
    meta,
    fingerprint,
    fingerprintValue,
    recordFor: (mirrorId, ecosystemId) => records.get(statusKey(mirrorId, ecosystemId)),
    statusFor: (mirrorId, ecosystemId) =>
      records.get(statusKey(mirrorId, ecosystemId))?.status ?? SYNC_UNKNOWN,
    refresh,
    checkFingerprint,
    dispose,
  };
}

/** 组件里使用的版本：初始化失败不影响页面（同步状态是增强功能）。 */
export function useMirrorStatus(options: MirrorStatusOptions = {}): MirrorStatusAccess {
  try {
    return createMirrorStatusAccess(options);
  } catch (error) {
    console.error('同步状态初始化失败，按无同步状态展示：', error);
    return {
      enabled: false,
      meta: ref<MirrorStatusMeta>({ stale: true, sources: [] }),
      fingerprint: ref<FingerprintState>('disabled'),
      fingerprintValue: ref<string | undefined>(undefined),
      recordFor: () => undefined,
      statusFor: () => SYNC_UNKNOWN,
      refresh: async () => undefined,
      checkFingerprint: async () => false,
      dispose: () => undefined,
    };
  }
}
