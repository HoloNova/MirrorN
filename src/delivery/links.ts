import { init, parse as parseModule } from 'es-module-lexer';
import { type BuildManifest } from './manifest.ts';
import { attribute, cssReferences, htmlDocument, text, type OutputReference } from './markup.ts';
import { textFile } from './files.ts';
import { isRouterDispatch, routerReferences } from './router-manifest.ts';

export function pageUrl(path: string): string {
  return `/${path === 'index.html' ? '' : path.endsWith('/index.html') ? path.slice(0, -10) : path}`;
}

/** file: 仅用于 URL 算法归一化，绝不访问文件 URL 或网络。 */
function localTarget(reference: OutputReference, source: string, files: ReadonlySet<string>, siteUrl: string | null) {
  const url = new URL(reference.url, `file://${pageUrl(source)}`);
  if (url.protocol !== 'file:' && (!siteUrl || url.origin !== new URL(siteUrl).origin)) {
    if (!['http:', 'https:', 'mailto:', 'data:'].includes(url.protocol)) throw new Error(`不支持的引用协议：${reference.url}`);
    return undefined;
  }
  const path = decodeURIComponent(url.pathname).replace(/^\//u, '');
  if (/[\\\u0000]/u.test(path) || path.split('/').includes('..')) throw new Error(`引用路径非法：${reference.url}`);
  const candidates = path.endsWith('/') || path === '' ? [`${path}index.html`] : [path, `${path}/index.html`];
  const target = candidates.find((candidate) => files.has(candidate));
  if (!target) throw new Error(`站内引用没有产物：${source} → ${reference.url}`);
  return { path: target, anchor: reference.anchors && url.hash ? decodeURIComponent(url.hash.slice(1)) : undefined };
}

async function moduleReferences(script: string, source: string): Promise<readonly OutputReference[]> {
  await init();
  const [imports] = parseModule(script);
  return imports.flatMap((entry) => {
    if (entry.type === 'import-meta') return [];
    if (!entry.specifier || (entry.type === 'dynamic' && entry.glob)) {
      const expression = script.slice(entry.importStart, entry.importEnd);
      if (isRouterDispatch(source, expression)) return [];
      throw new Error(`${source}：变量动态 import 无法静态核对：${expression}`);
    }
    const url = entry.specifier;
    if (!url.startsWith('.') && !url.startsWith('/')) throw new Error(`产物仍包含外部／裸模块导入：${url}`);
    return [{ url, anchors: false }];
  });
}

export async function checkOutputLinks(out: string, manifest: BuildManifest): Promise<number> {
  const files = new Set(manifest.files.map((entry) => entry.path));
  const htmlPaths = manifest.files.filter((entry) => entry.path.endsWith('.html')).map((entry) => entry.path);
  const documents = new Map(await Promise.all(htmlPaths.map(async (path) => [path, htmlDocument(await textFile(out, path))] as const)));
  let count = 0;
  const check = (source: string, reference: OutputReference): void => {
    const target = localTarget(reference, source, files, manifest.siteUrl);
    if (!target) return;
    if (target.anchor && (!documents.has(target.path) || !documents.get(target.path)?.ids.has(target.anchor))) {
      throw new Error(`锚点没有产物：${source} → ${reference.url}`);
    }
    count += 1;
  };
  const router = await routerReferences(out, files);
  for (const reference of router.references) check(router.path, reference);
  for (const [path, document] of documents) {
    if (document.nodes.some((node) => node.tagName === 'base')) throw new Error(`${path} 不允许改变站内 URL 基准的 base 标签`);
    for (const reference of document.references) check(path, reference);
    for (const node of document.nodes) {
      const index = attribute(node, 'data-search-index');
      if (index) check(path, { url: index, anchors: false });
      if (node.tagName === 'script' && !attribute(node, 'src') && attribute(node, 'type') !== 'application/json') {
        for (const reference of await moduleReferences(text(node), path)) check(path, reference);
      }
    }
  }
  for (const entry of manifest.files.filter((file) => file.path.endsWith('.css'))) {
    for (const reference of cssReferences(await textFile(out, entry.path))) check(entry.path, reference);
  }
  for (const entry of manifest.files.filter((file) => file.path.endsWith('.js'))) {
    for (const reference of await moduleReferences(await textFile(out, entry.path), entry.path)) check(entry.path, reference);
  }
  return count;
}
