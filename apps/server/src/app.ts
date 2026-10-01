import { getConnInfo } from '@hono/node-server/conninfo';
import { DATA_SCHEMA_VERSION } from '@mirrorn/shared';
import type { MirrorsStatusResponse } from '@mirrorn/shared';
import type { NetFingerprintResponse } from '@mirrorn/shared/sync';
import { Hono } from 'hono';

import type { StatusStore } from './state/statusStore.js';
import {
  getResource,
  lastCrawlAt,
  latestCrawl,
  listEcosystems,
  listSites,
  searchResources,
} from './db/catalog.js';
import type { DatabaseSync } from 'node:sqlite';
import { FileQueryError, queryFiles, queryFileOptions } from './db/fileQueries.js';
import { registerStaticRoutes } from './static.js';
import {
  computeFingerprint,
  resolveClientAddress,
  type FingerprintOptions,
} from './upstream/fingerprint.js';

export interface AppOptions {
  /** 不传时 `/api/mirrors` 返回“无数据”（全部未知），用于纯静态或未启用同步的场景。 */
  status?: StatusStore;
  /** 站点资源库；不传时资源接口返回空列表（数据库不可用时页面降级而不是报错）。 */
  db?: DatabaseSync;
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

  // 站点资源：搜索、筛选与详情都读同一个库，因此“搜到的”和“筛出来的”是同一批。
  app.get('/api/sites', (context) => {
    context.header('Cache-Control', 'no-store');
    return options.db
      ? context.json({ items: listSites(options.db) })
      : context.json({ error: '资源库不可用' }, 503);
  });
  app.get('/api/sites/:id', (context) => {
    context.header('Cache-Control', 'no-store');
    if (!options.db) return context.json({ error: '资源库不可用' }, 503);
    const site = listSites(options.db).find((site) => site.id === context.req.param('id'));
    return site ? context.json(site) : context.json({ error: '没有这个站点' }, 404);
  });

  app.get('/api/ecosystems', (context) => {
    context.header('Cache-Control', 'no-store');
    if (!options.db) return context.json({ error: '资源库不可用' }, 503);
    return context.json({ items: listEcosystems(options.db) });
  });

  app.get('/api/resources', (context) => {
    const query = context.req.query('q')?.trim();
    const ecosystem = context.req.query('ecosystem')?.trim();
    const site = context.req.query('site')?.trim();
    const kind = context.req.query('kind')?.trim();
    const tutorialsOnly = context.req.query('tutorials') === '1';
    const downloadableOnly = context.req.query('downloadable') === '1';
    const limit = Number(context.req.query('limit') ?? '50');
    if (!options.db) {
      context.header('Cache-Control', 'no-store');
      return context.json({ error: '资源库不可用' }, 503);
    }
    const items = searchResources(options.db, {
      ...(query === undefined || query === '' ? {} : { query }),
      ...(ecosystem === undefined || ecosystem === '' ? {} : { ecosystemId: ecosystem }),
      ...(site === undefined || site === '' ? {} : { siteId: site }),
      ...(kind === undefined || kind === '' ? {} : { kind }),
      ...(tutorialsOnly ? { onlyTutorials: true } : {}),
      ...(downloadableOnly ? { downloadableOnly: true } : {}),
      ...(Number.isFinite(limit) ? { limit } : {}),
    });
    context.header('Cache-Control', 'no-store');
    return context.json({ items });
  });

  // 旧的用户触发源站抓取已退出：兼容地址也不能联网兜底。
  for (const mode of ['browse', 'package'] as const) {
    app.get(`/api/resources/:id/${mode}`, (context) =>
      context.json({ error: '目录抓取已退出，请查询数据库文件接口' }, 410),
    );
  }

  app.get('/api/resources/:id/options', (context) => {
    context.header('Cache-Control', 'no-store');
    if (!options.db) return context.json({ error: '资源库不可用' }, 503);
    const resource = context.req.param('id');
    if (!getResource(options.db, resource))
      return context.json({ error: '没有这条已启用资源' }, 404);
    return context.json(
      queryFileOptions(options.db, {
        resource,
        ...Object.fromEntries(
          ['q', 'package', 'release', 'arch', 'platform'].flatMap((key) => {
            const value = context.req.query(key);
            return value === undefined ? [] : [[key, value]];
          }),
        ),
      }),
    );
  });

  app.get('/api/files', (context) => {
    context.header('Cache-Control', 'no-store');
    if (!options.db) return context.json({ error: '资源库不可用' }, 503);
    const resource = context.req.query('resource') ?? '';
    if (!getResource(options.db, resource))
      return context.json({ error: '没有这条已启用资源' }, 404);
    const limit = Number(context.req.query('limit') ?? '50');
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      return context.json({ error: 'limit需为1到200' }, 400);
    try {
      return context.json(
        queryFiles(options.db, {
          resource,
          limit,
          ...Object.fromEntries(
            [
              'q',
              'package',
              'version',
              'release',
              'arch',
              'platform',
              'role',
              'format',
              'cursor',
            ].flatMap((key) => {
              const value = context.req.query(key);
              return value === undefined ? [] : [[key, value]];
            }),
          ),
        }),
      );
    } catch (error) {
      if (error instanceof FileQueryError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get('/api/resources/:id', (context) => {
    context.header('Cache-Control', 'no-store');
    if (options.db === undefined) {
      return context.json({ error: '资源库不可用' }, 503);
    }
    const resource = getResource(options.db, context.req.param('id'));
    if (resource === undefined) {
      return context.json({ error: '没有这条资源' }, 404);
    }
    const page = queryFiles(options.db, { resource: resource.id });
    const artifacts = page.items;
    const crawledAt = lastCrawlAt(options.db, resource.id);
    return context.json({
      resource,
      artifacts,
      nextCursor: page.nextCursor,
      ...(crawledAt === undefined ? {} : { crawledAt }),
      crawl: latestCrawl(options.db, resource.id) ?? null,
    });
  });

  app.get('/api/sites/:id/resources', (context) => {
    context.header('Cache-Control', 'no-store');
    if (!options.db) return context.json({ error: '资源库不可用' }, 503);
    return context.json({
      items: searchResources(options.db, { siteId: context.req.param('id'), limit: 200 }),
    });
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
