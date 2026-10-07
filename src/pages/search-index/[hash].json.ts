import { fileURLToPath } from 'node:url';
import { root } from 'astro:config/server';
import type { APIRoute, GetStaticPaths } from 'astro';
import { siteConfig } from '../../../config/site.ts';
import { loadResourceRegistry } from '../../content/registry/load.ts';
import { createSearchSnapshot } from '../../content/search/snapshot.ts';

interface Props { readonly text: string }

export const getStaticPaths = (async () => {
  const registry = await loadResourceRegistry(fileURLToPath(root), { siteUrl: siteConfig.siteUrl });
  const snapshot = createSearchSnapshot(registry);
  return [{ params: { hash: snapshot.hash }, props: { text: snapshot.text } satisfies Props }];
}) satisfies GetStaticPaths;

/** 生产是静态 JSON 文件，不是接收查询或磁盘路径的搜索 API。 */
export const GET: APIRoute = ({ props }) => new Response((props as Props).text, { headers: {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'public, max-age=31536000, immutable',
} });
