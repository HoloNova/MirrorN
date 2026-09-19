import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

import type { Hono } from 'hono';

/**
 * 容器部署时的静态资源服务：同一个进程既提供 `/api`，也直接托管前端产物。
 *
 * 为什么不用 nginx：单镜像部署只需要一个进程、一个端口，回滚就是换镜像；
 * 线上生产环境用的是 Caddy 的 file_server（见 docs/deployment.md），两者互不影响。
 */

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

export interface StaticOptions {
  /** 前端产物目录。目录不存在时不做任何处理（纯 API 模式）。 */
  dir: string;
}

/**
 * 缓存策略与 Caddy 一致：`/assets/` 下的文件名带内容哈希，可以长期缓存；
 * 其它文件（含 index.html）每次都校验，避免用户拿到旧页面。
 */
export function cacheControlFor(path: string): string {
  return path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
}

function isInside(root: string, candidate: string): boolean {
  const relative = resolve(candidate).slice(resolve(root).length);
  return relative === '' || relative.startsWith('/');
}

export function registerStaticRoutes(app: Hono, options: StaticOptions): void {
  const root = resolve(options.dir);

  app.get('*', (context) => {
    const requestPath = decodeURIComponent(new URL(context.req.url).pathname);
    // 只允许读取 root 内的文件：把 `..` 规范化掉，避免路径穿越。
    const candidate = join(root, normalize(requestPath).replace(/^([.]{2}[/\\])+/, ''));
    const fallback = join(root, 'index.html');

    const filePath =
      isInside(root, candidate) && existsSync(candidate) && statSync(candidate).isFile()
        ? candidate
        : fallback;

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return context.notFound();
    }

    const extension = extname(filePath).toLowerCase();
    const headers = new Headers({
      'Cache-Control': cacheControlFor(`/${filePath.slice(root.length + 1)}`),
      'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      // 与 Caddy 站点保持同一组基础安全头。
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });

    const stream = createReadStream(filePath) as unknown as ReadableStream;
    return new Response(stream, { status: 200, headers });
  });
}
