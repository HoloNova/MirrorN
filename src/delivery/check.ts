import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'parse5';
import { fontLicenseFiles, licenseFiles } from '../../config/licensing.ts';
import { requireReleaseSite } from '../../config/deployment.ts';
import { siteConfig } from '../../config/site.ts';
import { loadResourceRegistry } from '../content/registry/load.ts';
import type { ResourceRegistry } from '../content/registry/types.ts';
import { assetUrl } from '../content/resolve/assets.ts';
import { createSearchSnapshot } from '../content/search/snapshot.ts';
import { fileRecord, manifestName, outputFiles, sha256, textFile } from './files.ts';
import { checkOutputLinks, pageUrl } from './links.ts';
import { contentDigest, manifestSchema, type BuildManifest } from './manifest.ts';
import { attribute, elements, htmlDocument, text } from './markup.ts';

export const fixedPages = ['index.html', 'resources/index.html', 'about/index.html', '404.html'] as const;

function expectedPaths(registry: ResourceRegistry, manifest: BuildManifest): ReadonlySet<string> {
  return new Set([
    ...fixedPages, 'robots.txt',
    ...registry.resources.map((resource) => `resources/${resource.metadata.id}/index.html`),
    ...registry.resources.flatMap((resource) => resource.files.map((file) => assetUrl(resource, file).slice(1))),
    createSearchSnapshot(registry).url.slice(1),
    ...licenseFiles.map((entry) => `licenses/${entry.name}.txt`),
    ...fontLicenseFiles.map((entry) => entry.url.slice(1)),
    ...(manifest.mode === 'release' ? ['sitemap-index.xml', 'sitemap-0.xml'] : []),
  ]);
}

async function checkIdentity(root: string, out: string, registry: ResourceRegistry, manifest: BuildManifest): Promise<void> {
  const { artifactHash, ...payload } = manifest;
  if (sha256(JSON.stringify(payload)) !== artifactHash) throw new Error('产物清单摘要不一致');
  if (manifest.contentHash !== contentDigest(registry)) throw new Error('内容已变化，当前产物不属于本次资源集合，请重新构建');
  const paths = (await outputFiles(out)).filter((path) => path !== manifestName);
  if (paths.length !== manifest.files.length || new Set(manifest.files.map((entry) => entry.path)).size !== paths.length) {
    throw new Error('产物与清单文件集合不一致');
  }
  const expected = expectedPaths(registry, manifest);
  const actual = new Set(paths);
  for (const path of expected) if (!actual.has(path)) throw new Error(`产物缺少 ${path}`);
  for (const path of paths) {
    if (!expected.has(path) && !/^_astro\/[a-zA-Z0-9_.-]+\.(?:js|css|woff2)$/u.test(path)) {
      throw new Error(`产物含未登记文件（可能是草稿／源码／归档／旧版本残留）：${path}`);
    }
    const record = await fileRecord(out, path);
    const declared = manifest.files.find((entry) => entry.path === path);
    if (!declared || declared.size !== record.size || declared.sha256 !== record.sha256) throw new Error(`产物字节与清单不符：${path}`);
  }
  for (const entry of [...licenseFiles.map((license) => ({ path: license.path, url: `/licenses/${license.name}.txt` })), ...fontLicenseFiles]) {
    const original = await readFile(join(root, entry.path));
    if (sha256(original) !== (await fileRecord(out, entry.url.slice(1))).sha256) throw new Error(`原始许可未完整分发：${entry.path}`);
  }
}

async function checkResources(out: string, registry: ResourceRegistry): Promise<void> {
  const snapshot = createSearchSnapshot(registry);
  if (await textFile(out, snapshot.url.slice(1)) !== snapshot.text) throw new Error('搜索索引不属于本次公开集合');
  const home = htmlDocument(await textFile(out, 'index.html'));
  const bindings = home.nodes.filter((node) => attribute(node, 'data-search-index') !== undefined);
  if (bindings.length !== 1 || attribute(bindings[0]!, 'data-search-index') !== snapshot.url) throw new Error('首页与索引版本不一致');
  for (const resource of registry.resources) {
    const page = htmlDocument(await textFile(out, `resources/${resource.metadata.id}/index.html`));
    for (const heading of resource.document.headings) if (!page.ids.has(heading.id)) throw new Error(`${resource.metadata.id} 缺正文锚点 ${heading.id}`);
    for (const file of resource.files) {
      const record = await fileRecord(out, assetUrl(resource, file).slice(1));
      if (record.sha256 !== file.sha256 || record.size !== file.byteLength) throw new Error(`公开附件不对应源字节：${resource.metadata.id}/${file.path}`);
    }
  }
}

async function checkSeo(out: string, registry: ResourceRegistry, manifest: BuildManifest): Promise<void> {
  const release = manifest.mode === 'release';
  if (release) {
    requireReleaseSite(manifest.siteUrl);
    if (manifest.siteUrl !== siteConfig.siteUrl || !manifest.commit || manifest.dirty !== false) throw new Error('正式产物发布配置／源码标识无效');
  } else if (manifest.siteUrl !== null) throw new Error('预览产物不得声明正式发布地址');
  const htmlPaths = [...fixedPages, ...registry.resources.map((resource) => `resources/${resource.metadata.id}/index.html`)];
  for (const path of htmlPaths) {
    const document = htmlDocument(await textFile(out, path));
    const robots = document.nodes.find((node) => node.tagName === 'meta' && attribute(node, 'name') === 'robots');
    const canonical = document.nodes.filter((node) => node.tagName === 'link' && attribute(node, 'rel') === 'canonical');
    const noindex = !release || path === '404.html';
    if (noindex && (!attribute(robots!, 'content')?.split(/[ ,]+/u).includes('noindex') || canonical.length !== 0)) {
      throw new Error(`${path} 必须 noindex 且不能输出 canonical`);
    }
    if (!noindex && (robots || canonical.length !== 1 || attribute(canonical[0]!, 'href') !== new URL(pageUrl(path), manifest.siteUrl!).href)) {
      throw new Error(`${path} 正式索引／canonical 无效`);
    }
  }
  const expectedRobots = release ? `User-agent: *\nAllow: /\nSitemap: ${manifest.siteUrl}/sitemap-index.xml\n` : 'User-agent: *\nDisallow: /\n';
  if (await textFile(out, 'robots.txt') !== expectedRobots) throw new Error('robots 与构建模式不一致');
  if (release) {
    const locs = elements(parse(await textFile(out, 'sitemap-0.xml'))).filter((node) => node.tagName === 'loc').map(text).toSorted();
    const pages = htmlPaths.filter((path) => path !== '404.html').map((path) => new URL(pageUrl(path), manifest.siteUrl!).href).toSorted();
    if (JSON.stringify(locs) !== JSON.stringify(pages)) throw new Error('sitemap 未完整对应本次公开页面集合');
    const index = elements(parse(await textFile(out, 'sitemap-index.xml'))).filter((node) => node.tagName === 'loc').map(text);
    if (JSON.stringify(index) !== JSON.stringify([`${manifest.siteUrl}/sitemap-0.xml`])) throw new Error('sitemap 索引不对应本次产物');
  }
}

export async function checkDist(root: string, out: string) {
  const manifest = manifestSchema.parse(JSON.parse(await textFile(out, manifestName)));
  const registry = await loadResourceRegistry(root, { siteUrl: siteConfig.siteUrl });
  await checkIdentity(root, out, registry, manifest);
  await checkResources(out, registry);
  await checkSeo(out, registry, manifest);
  const references = await checkOutputLinks(out, manifest);
  return { mode: manifest.mode, artifactHash: manifest.artifactHash, files: manifest.files.length, resources: registry.resources.length, references };
}
