import { z } from 'zod';
import { textFile } from './files.ts';
import type { OutputReference } from './markup.ts';

const asset = z.string().regex(/^\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css)$/u);
const moduleRecord = z.object({
  module: asset,
  imports: z.array(asset).optional(),
  css: z.array(asset).optional(),
  clientActionModule: asset.optional(),
  clientLoaderModule: asset.optional(),
  clientMiddlewareModule: asset.optional(),
  hydrateFallbackModule: asset.optional(),
});
const routerManifest = z.object({ entry: moduleRecord, routes: z.record(z.string(), moduleRecord), url: asset.optional() });

/** 框架清单是固定赋值后的 JSON；只解析数据，绝不执行生成的 JavaScript。 */
export async function routerReferences(out: string, files: ReadonlySet<string>) {
  const manifests = [...files].filter((path) => /^assets\/manifest-[a-zA-Z0-9_-]+\.js$/u.test(path));
  if (manifests.length !== 1) throw new Error('必须恰有一份 React Router 模块清单');
  const path = manifests[0]!;
  const script = (await textFile(out, path)).trim();
  const prefix = 'window.__reactRouterManifest=';
  if (!script.startsWith(prefix) || !script.endsWith(';')) throw new Error('React Router 清单赋值契约已变化');
  const manifest = routerManifest.parse(JSON.parse(script.slice(prefix.length, -1)));
  const references: readonly OutputReference[] = [manifest.entry, ...Object.values(manifest.routes)].flatMap((record) => [
    record.module, ...(record.imports ?? []), ...(record.css ?? []),
    ...[record.clientActionModule, record.clientLoaderModule, record.clientMiddlewareModule, record.hydrateFallbackModule].filter((value): value is string => Boolean(value)),
  ]).map((url) => ({ url, anchors: false }));
  return { path, references: [...references, ...(manifest.url ? [{ url: manifest.url, anchors: false }] : [])] };
}

/** 仅兼容已锁定框架的清单分派；其余变量导入不放行。 */
export function isRouterDispatch(source: string, expression: string): boolean {
  return /^assets\/errorBoundaries-[a-zA-Z0-9_-]+\.js$/u.test(source)
    && /^import\([a-zA-Z_$][\w$]*(?:\.(?:module|clientActionModule|clientLoaderModule|clientMiddlewareModule|hydrateFallbackModule))?\)$/u.test(expression);
}
