import { isAbsolute, join, relative, sep } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { siteConfig } from '../../config/site.ts';
import { siteConfigWarnings } from '../../config/site.ts';
import { readPublicStaticFile } from '../delivery/static-files.ts';
import { loadResourceRegistry } from './registry/load.ts';

const contentReloadDelayMs = 150;
function isContentPath(root: string, path: string): boolean {
  const value = relative(root, path);
  return !isAbsolute(value) && value !== '..' && !value.startsWith(`..${sep}`);
}

/** 内容校验接入 Vite；开发静态文件与正式输出共用字节读取，不建设运行时下载服务。 */
export function contentIntegration(): Plugin {
  let root = '';
  return {
    name: 'mirrorn-content',
    configResolved(config) { root = config.root; },
    async buildStart() { await loadResourceRegistry(root, { siteUrl: siteConfig.siteUrl }); },
    configureServer(server) {
      for (const message of siteConfigWarnings) server.config.logger.warn(message);
      watchContent(root, server);
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (!/^\/(?:search-index\/|resource-assets\/|licenses\/|robots\.txt$)/u.test(path)) { next(); return; }
        if (request.method !== 'GET' && request.method !== 'HEAD') { response.statusCode = 405; response.end(); return; }
        void loadResourceRegistry(root, { siteUrl: siteConfig.siteUrl }).then((registry) => readPublicStaticFile(root, registry, path)).then((file) => {
          if (!file) { response.statusCode = 404; response.end('Not found'); return; }
          response.setHeader('Content-Type', file.type);
          response.setHeader('Content-Length', file.bytes.byteLength);
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.end(request.method === 'HEAD' ? undefined : file.bytes);
        }).catch((error: unknown) => {
          server.config.logger.error(error instanceof Error ? error.message : String(error));
          response.statusCode = 500;
          response.end('Content validation failed');
        });
      });
    },
  };
}

function watchContent(root: string, server: ViteDevServer): void {
  const contentRoot = join(root, 'content/resources');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let running = false;
  let closed = false;
  const refresh = async (): Promise<void> => {
    if (running || closed) return;
    running = true;
    try {
      while (dirty && !closed) {
        dirty = false;
        try {
          await loadResourceRegistry(root, { siteUrl: siteConfig.siteUrl });
          if (!dirty && !closed) {
            server.moduleGraph.invalidateAll();
            server.ws.send({ type: 'full-reload', path: '*' });
          }
        } catch (error) {
          if (!dirty && !closed) {
            const message = error instanceof Error ? error.message : String(error);
            server.config.logger.error(message);
            server.ws.send({ type: 'error', err: { message, stack: '' } });
          }
        }
      }
    } finally { running = false; }
  };
  const schedule = (path: string): void => {
    if (closed || !isContentPath(contentRoot, path)) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => { void refresh().catch((error: unknown) => server.config.logger.error(String(error))); }, contentReloadDelayMs);
  };
  const events = ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const;
  server.watcher.add(contentRoot);
  for (const event of events) server.watcher.on(event, schedule);
  server.httpServer?.once('close', () => {
    closed = true;
    clearTimeout(timer);
    for (const event of events) server.watcher.off(event, schedule);
  });
}
