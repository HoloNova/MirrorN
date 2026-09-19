import { getConnInfo } from '@hono/node-server/conninfo';
import { DATA_SCHEMA_VERSION } from '@mirrorn/shared';
import type { MirrorsStatusResponse } from '@mirrorn/shared';
import type { NetFingerprintResponse } from '@mirrorn/shared/sync';
import { Hono } from 'hono';

import type { StatusStore } from './state/statusStore.js';
import { registerStaticRoutes } from './static.js';
import {
  computeFingerprint,
  resolveClientAddress,
  type FingerprintOptions,
} from './upstream/fingerprint.js';

export interface AppOptions {
  /** 不传时 `/api/mirrors` 返回“无数据”（全部未知），用于纯静态或未启用同步的场景。 */
  status?: StatusStore;
  fingerprint?: FingerprintOptions;
  /** 前端产物目录（容器部署时用）；不传则只提供 API。 */
  staticDir?: string;
  now?: () => number;
}

function emptyResponse(at: number): MirrorsStatusResponse {
  return { generatedAt: at, stale: true, items: [], sources: [] };
}

export function createApp(options: AppOptions = {}): Hono {
  const app = new Hono();
  const now = options.now ?? (() => Date.now());
  const fingerprintOptions: FingerprintOptions = options.fingerprint ?? { trustProxy: false };

  app.get('/api/health', (context) =>
    context.json({
      status: 'ok',
      service: 'mirrorn-server',
      dataSchemaVersion: DATA_SCHEMA_VERSION,
    }),
  );

  app.get('/api/mirrors', (context) => {
    const payload = options.status?.read() ?? emptyResponse(now());
    // 状态接口必须每次校验：中间层缓存住会直接违背“不把过期数据伪装成实时状态”。
    context.header('Cache-Control', 'no-store');
    return context.json(payload);
  });

  app.get('/api/net-fingerprint', (context) => {
    let remoteAddress: string | undefined;
    try {
      remoteAddress = getConnInfo(context).remote.address;
    } catch {
      // 单元测试里没有真实 socket；真实运行时也允许取不到地址。
      remoteAddress = undefined;
    }

    const address = resolveClientAddress({
      ...(remoteAddress === undefined ? {} : { remoteAddress }),
      forwardedFor: context.req.header('x-forwarded-for'),
      trustProxy: fingerprintOptions.trustProxy,
    });
    const computed = computeFingerprint(fingerprintOptions, address);

    const payload: NetFingerprintResponse = {
      available: computed.available,
      ...(computed.fingerprint === undefined ? {} : { fingerprint: computed.fingerprint }),
      computedAt: now(),
      ...(computed.reason === undefined ? {} : { reason: computed.reason }),
    };

    context.header('Cache-Control', 'no-store');
    return context.json(payload);
  });

  // 静态托管放在最后注册：`/api/*` 路由先匹配，不会被通配符抢走。
  if (options.staticDir !== undefined) {
    registerStaticRoutes(app, { dir: options.staticDir });
  }

  return app;
}
