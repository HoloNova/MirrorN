import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { SitemapIndexStream, SitemapStream, streamToPromise } from 'sitemap';
import { buildMode, releaseSiteUrl } from '../../config/deployment.ts';
import { siteConfig } from '../../config/site.ts';
import { loadResourceRegistry } from '../content/registry/load.ts';
import { contentDigest, sourceRevision, writeBuildManifest } from './manifest.ts';
import { publicStaticPaths, readPublicStaticFile } from './static-files.ts';

export function pagePaths(ids: readonly string[]): readonly string[] {
  return ['/', '/resources/', '/about/', '/404.html', ...ids.map((id) => `/resources/${id}/`)];
}
export function routeDataPath(path: string): string { return (path.endsWith('/') ? `${path}_.data` : `${path}.data`).slice(1); }
async function writeSiteMaps(out: string, ids: readonly string[]): Promise<void> {
  if (!releaseSiteUrl) return;
  const pages = new SitemapStream({ hostname: releaseSiteUrl });
  const pagesResult = streamToPromise(pages);
  for (const path of pagePaths(ids).filter((entry) => entry !== '/404.html')) pages.write({ url: path });
  pages.end();
  await writeFile(join(out, 'sitemap-0.xml'), await pagesResult);
  const index = new SitemapIndexStream();
  const indexResult = streamToPromise(index);
  index.write({ url: `${releaseSiteUrl}/sitemap-0.xml` });
  index.end();
  await writeFile(join(out, 'sitemap-index.xml'), await indexResult);
}

/** 发布目录只含静态页面、客户端资产与公开文件；构建端服务包和 SPA 兜底不发布。 */
export async function finishStaticBuild(root: string, client: string, startedContent: string, startedCommit: string | null): Promise<void> {
  const registry = await loadResourceRegistry(root, { siteUrl: siteConfig.siteUrl });
  if (contentDigest(registry) !== startedContent) throw new Error('内容在预渲染期间变化，请重新构建，不能发布混合版本。');
  if (buildMode === 'release') {
    const revision = await sourceRevision(root);
    if (revision.dirty !== false || revision.commit !== startedCommit) throw new Error('源码修订在正式构建期间变化，请重新审核后构建。');
  }
  const notFound = await readFile(join(client, '404.html/index.html'));
  const out = join(root, 'dist');
  await rm(out, { recursive: true, force: true });
  await cp(client, out, { recursive: true, filter: (path) => !['.vite', '__spa-fallback.html', '404.html'].includes(basename(path)) });
  await writeFile(join(out, '404.html'), notFound);
  for (const path of publicStaticPaths(registry)) {
    const file = await readPublicStaticFile(root, registry, path);
    if (!file) throw new Error(`已登记公开文件不可读取：${path}`);
    const destination = join(out, path.slice(1));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes);
  }
  await writeSiteMaps(out, registry.resources.map((resource) => resource.metadata.id));
  await writeBuildManifest(root, out, registry, buildMode, releaseSiteUrl);
  process.stdout.write(`静态交付完成：${registry.resources.length + 4} 页、${registry.summary.selectedAssetFiles} 附件；构建服务包与 SPA 兜底未发布。\n`);
}
