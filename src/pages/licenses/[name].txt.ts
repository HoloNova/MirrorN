import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIRoute } from 'astro';
import { root } from 'astro:config/server';
import { licenseFiles } from '../../../config/licensing.ts';

interface Props { path: string }
export function getStaticPaths() {
  return licenseFiles.map((entry) => ({ params: { name: entry.name }, props: { path: entry.path } satisfies Props }));
}
export const GET: APIRoute = async ({ props }) => {
  const { path } = props as Props;
  if (!licenseFiles.some((entry) => entry.path === path)) throw new Error('未登记的公开许可文件');
  const bytes = await readFile(join(fileURLToPath(root), path));
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
