import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration, HookParameters } from 'astro';
import { siteConfig } from '../../config/site.ts';
import { loadResourceRegistry } from './registry/load.ts';

const contentReloadDelayMs = 150;

type ServerSetup = HookParameters<'astro:server:setup'>;

function isContentPath(root: string, path: string): boolean {
  const relativePath = relative(root, path);
  return !isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${sep}`);
}

/** 同一 CLI 处理链接入 Astro，内容错误在构建页面之前就阻断，不等到渲染器里降级为空态。 */
async function checkContent(root: string, logger: ServerSetup['logger']): Promise<void> {
  const registry = await loadResourceRegistry(root, { siteUrl: siteConfig.siteUrl });
  logger.info(`内容校验通过：${registry.summary.publishedResources} 个公开资源，${registry.summary.draftResources} 个草稿。`);
}

function watchContent(root: string, { server, logger }: ServerSetup): () => void {
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
          await checkContent(root, logger);
          if (!dirty && !closed) {
            server.moduleGraph.invalidateAll();
            server.ws.send({ type: 'full-reload', path: '*' });
          }
        } catch (error) {
          if (!dirty && !closed) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(message);
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
    timer = setTimeout(() => {
      void refresh().catch((error: unknown) => logger.error(error instanceof Error ? error.message : String(error)));
    }, contentReloadDelayMs);
  };
  server.watcher.add(contentRoot);
  for (const event of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const) server.watcher.on(event, schedule);
  return () => {
    closed = true;
    clearTimeout(timer);
    for (const event of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const) server.watcher.off(event, schedule);
  };
}

export function contentIntegration(): AstroIntegration {
  let projectRoot: string | undefined;
  let dispose: (() => void) | undefined;
  return {
    name: 'mirrorn-content',
    hooks: {
      'astro:config:setup': async ({ config, command, logger }) => {
        if (command !== 'dev' && command !== 'build') return;
        projectRoot = fileURLToPath(config.root);
        await checkContent(projectRoot, logger);
      },
      'astro:server:setup': (options) => {
        if (projectRoot) dispose = watchContent(projectRoot, options);
      },
      'astro:server:done': () => { dispose?.(); },
    },
  };
}
