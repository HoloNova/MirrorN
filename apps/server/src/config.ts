/**
 * 后端端口默认值。
 *
 * dev 脚本会显式在 `--port` 里写上这个值：原因是通用环境变量 `PORT` 经常被同机上的
 * 其他工具占用（例如某些 Web 面板），而 `pnpm dev` 会继承 shell 环境。那种情况下
 * 后端会因为端口被占而崩，历史上还连带把前端 dev server 一起结束了，页面直接白屏。
 */
import {
  SYNC_FETCH_TIMEOUT_MS,
  SYNC_INTERVAL_MS,
  SYNC_MAX_RESPONSE_BYTES,
  SYNC_STALE_AFTER_MS,
} from '@mirrorn/shared/sync';

export const DEFAULT_PORT = 8787;

export type PortSource = '--port' | 'MIRRORN_PORT' | 'PORT' | 'default';

export interface ResolvedPort {
  port: number;
  source: PortSource;
}

export type PortResolution = { ok: true; value: ResolvedPort } | { ok: false; message: string };

export interface ResolvePortInput {
  /** 传给进程的参数，不含 node 与脚本路径。 */
  argv: string[];
  env: Record<string, string | undefined>;
}

function parsePortValue(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const value = Number(trimmed);
  return value >= 1 && value <= 65535 ? value : undefined;
}

function readFlagPort(argv: string[]): { raw?: string; error?: string } {
  let raw: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--port') {
      const next: string | undefined = argv[index + 1];
      if (next === undefined || next.startsWith('--')) {
        return { error: '--port 后面缺少端口号。' };
      }
      raw = next;
      index += 1;
    } else if (item.startsWith('--port=')) {
      raw = item.slice('--port='.length);
    }
  }

  // 传了多次时最后一个生效，这样 `pnpm --filter @mirrorn/server dev -- --port 9000`
  // 可以覆盖 dev 脚本里固定的 8787。
  return raw === undefined ? {} : { raw };
}

/**
 * 端口解析顺序：`--port`（可重复，最后一个生效）→ `MIRRORN_PORT` → `PORT` → 8787。
 *
 * `--port` 优先于环境变量是有意的：dev 脚本用它固定 8787，这样 shell 里恰好导出的
 * `PORT` 不会改变 dev 的端口。部署时用平台注入的 `PORT` 仍然生效（那时没有 `--port`）。
 */
export function resolvePort({ argv, env }: ResolvePortInput): PortResolution {
  const flag = readFlagPort(argv);
  if (flag.error !== undefined) {
    return { ok: false, message: flag.error };
  }

  const candidates: Array<{ source: PortSource; raw: string | undefined }> = [
    { source: '--port', raw: flag.raw },
    { source: 'MIRRORN_PORT', raw: env.MIRRORN_PORT },
    { source: 'PORT', raw: env.PORT },
  ];

  for (const { source, raw } of candidates) {
    if (raw === undefined || raw.trim() === '') {
      continue;
    }
    const port = parsePortValue(raw);
    if (port === undefined) {
      return { ok: false, message: `${source} 必须是 1 到 65535 之间的整数，当前值：${raw}` };
    }
    return { ok: true, value: { port, source } };
  }

  return { ok: true, value: { port: DEFAULT_PORT, source: 'default' } };
}

export interface ServerEnv {
  port: number;
  portSource: PortSource;
  /** 监听地址。默认只绑本地：对外由同机反向代理负责（见 docs/deployment.md）。 */
  host: string;
  /**
   * 上游状态快照目录。相对路径由调用方相对**仓库根**解析，而不是相对进程 cwd：
   * 经 `pnpm --filter` 运行时 cwd 是 apps/server，按 cwd 解析会生成
   * `apps/server/apps/server/.data/...` 这种嵌套路径（实测踩过）。
   * 容器部署时应挂载为 volume。
   */
  snapshotDir: string;
  syncEnabled: boolean;
  syncIntervalMs: number;
  staleAfterMs: number;
  fetchTimeoutMs: number;
  maxResponseBytes: number;
  /** 前面是否存在可信代理（决定是否解析 X-Forwarded-For）。默认 false。 */
  trustProxy: boolean;
  fingerprintSecret?: string;
  dataDir?: string;
  /** 前端产物目录：设置后同一个进程同时托管静态页面（容器部署用）。 */
  staticDir?: string;
}

export type ServerEnvResolution = { ok: true; value: ServerEnv } | { ok: false; message: string };

function readPositiveInt(
  raw: string | undefined,
  fallback: number,
): { value: number } | { error: string } {
  if (raw === undefined || raw.trim() === '') {
    return { value: fallback };
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return { error: `必须是正整数，当前值：${raw}` };
  }
  return { value };
}

/** 去掉尾部斜杠；'/' 原样保留，空串按未配置处理。 */
function normalizeDir(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === '') {
    return undefined;
  }
  const stripped = trimmed.replace(/\/+$/, '');
  return stripped === '' ? '/' : stripped;
}

function readBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

/**
 * 除端口外的服务端配置。
 *
 * 设计原则：所有会影响外部行为的开关都有明确默认值，并且**默认最保守**——
 * 同步默认开启（否则功能等于不存在），可信代理默认关闭（否则任何人都能伪造指纹），
 * 指纹 secret 默认不配置（那就不提供指纹，而不是提供假指纹）。
 */
export function resolveServerEnv(input: ResolvePortInput): ServerEnvResolution {
  const port = resolvePort(input);
  if (!port.ok) {
    return port;
  }

  const { env } = input;
  const interval = readPositiveInt(env.MIRRORN_SYNC_INTERVAL_MS, SYNC_INTERVAL_MS);
  if ('error' in interval) {
    return { ok: false, message: `MIRRORN_SYNC_INTERVAL_MS ${interval.error}` };
  }

  const stale = readPositiveInt(env.MIRRORN_SYNC_STALE_AFTER_MS, SYNC_STALE_AFTER_MS);
  if ('error' in stale) {
    return { ok: false, message: `MIRRORN_SYNC_STALE_AFTER_MS ${stale.error}` };
  }

  const timeout = readPositiveInt(env.MIRRORN_FETCH_TIMEOUT_MS, SYNC_FETCH_TIMEOUT_MS);
  if ('error' in timeout) {
    return { ok: false, message: `MIRRORN_FETCH_TIMEOUT_MS ${timeout.error}` };
  }

  const maxBytes = readPositiveInt(env.MIRRORN_MAX_RESPONSE_BYTES, SYNC_MAX_RESPONSE_BYTES);
  if ('error' in maxBytes) {
    return { ok: false, message: `MIRRORN_MAX_RESPONSE_BYTES ${maxBytes.error}` };
  }

  const snapshotDir = normalizeDir(env.MIRRORN_SNAPSHOT_DIR) ?? 'apps/server/.data';
  const secret = env.MIRRORN_FINGERPRINT_SECRET?.trim();
  const dataDir = env.MIRRORN_DATA_DIR?.trim();
  const staticDir = normalizeDir(env.MIRRORN_STATIC_DIR);

  return {
    ok: true,
    value: {
      port: port.value.port,
      portSource: port.value.source,
      host: env.MIRRORN_HOST?.trim() || '127.0.0.1',
      snapshotDir,
      syncEnabled: readBoolean(env.MIRRORN_SYNC_ENABLED, true),
      syncIntervalMs: interval.value,
      staleAfterMs: stale.value,
      fetchTimeoutMs: timeout.value,
      maxResponseBytes: maxBytes.value,
      trustProxy: readBoolean(env.MIRRORN_TRUSTED_PROXY, false),
      ...(secret ? { fingerprintSecret: secret } : {}),
      ...(dataDir ? { dataDir } : {}),
      ...(staticDir ? { staticDir } : {}),
    },
  };
}
