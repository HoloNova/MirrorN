import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import GithubSlugger from 'github-slugger';
import { toString } from 'mdast-util-to-string';
import type { Nodes, Root } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { projectRoot, reportFailure } from './run.ts';

const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']);
function nodes(node: Nodes): readonly Nodes[] {
  return [node, ...('children' in node ? node.children.flatMap(nodes) : [])];
}
async function document(path: string) {
  const bytes = await readFile(path);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\u0000')) throw new Error(`${relative(projectRoot, path)} 含 NUL`);
  const tree = parser.parse(text) as Root;
  const all = nodes(tree);
  const slugger = new GithubSlugger();
  const ids = new Set(all.flatMap((node) => node.type === 'heading' ? [slugger.slug(toString(node))] : []));
  const definitions = new Map(all.flatMap((node) => node.type === 'definition' ? [[node.identifier, node.url] as const] : []));
  const links = all.flatMap((node) => {
    if (node.type === 'link' || node.type === 'image') return [{ url: node.url, line: node.position?.start.line ?? 1 }];
    if (node.type === 'linkReference' || node.type === 'imageReference') {
      const url = definitions.get(node.identifier);
      if (!url) throw new Error(`${relative(projectRoot, path)}:${node.position?.start.line ?? 1} 未定义引用 ${node.identifier}`);
      return [{ url, line: node.position?.start.line ?? 1 }];
    }
    return [];
  });
  return { ids, links };
}

async function markdownFiles(path: string): Promise<readonly string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  let files: readonly string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`文档扫描不接受 symlink：${entry.name}`);
    const target = join(path, entry.name);
    if (entry.isDirectory()) files = [...files, ...await markdownFiles(target)];
    else if (entry.isFile() && entry.name.endsWith('.md')) files = [...files, target];
  }
  return files;
}

async function checkLink(source: string, url: string, line: number, cache: ReadonlyMap<string, Awaited<ReturnType<typeof document>>>): Promise<boolean> {
  if (/^(?:https?:|mailto:)/iu.test(url) || url.startsWith('//')) return false;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(url)) throw new Error(`${source}:${line} 非法文档链接协议：${url}`);
  const parsed = new URL(url, 'file:///');
  const rawPath = url.split(/[?#]/u)[0] ?? '';
  const linkedTarget = rawPath ? resolve(dirname(source), decodeURIComponent(rawPath)) : source;
  const target = parsed.hash && (await stat(linkedTarget)).isDirectory() ? join(linkedTarget, 'README.md') : linkedTarget;
  const path = relative(projectRoot, target);
  if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) throw new Error(`${source}:${line} 文档链接超出仓库：${url}`);
  const info = await stat(target);
  if (!info.isFile() && !info.isDirectory()) throw new Error(`${source}:${line} 文档链接不是文件或目录：${url}`);
  if (parsed.hash) {
    if (extname(target) !== '.md') throw new Error(`${source}:${line} 非 Markdown 文件不能校验章节：${url}`);
    const result = cache.get(target) ?? await document(target);
    if (!result.ids.has(decodeURIComponent(parsed.hash.slice(1)))) throw new Error(`${source}:${line} 文档锚点不存在：${url}`);
  }
  return true;
}

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('Usage: pnpm docs:check（无额外参数）');
  const rootDocs = (await readdir(projectRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => join(projectRoot, entry.name));
  const files = [...rootDocs, ...await markdownFiles(join(projectRoot, 'docs')),
    ...await markdownFiles(join(projectRoot, 'templates')), join(projectRoot, '.github/PULL_REQUEST_TEMPLATE.md')];
  const cache = new Map(await Promise.all(files.map(async (file) => [file, await document(file)] as const)));
  let references = 0;
  for (const file of files.toSorted()) {
    const parsed = cache.get(file) ?? await document(file);
    for (const link of parsed.links) {
      try { if (await checkLink(file, link.url, link.line, cache)) references += 1; }
      catch (error) { throw new Error(`${relative(projectRoot, file)}:${link.line} → ${link.url}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
    }
  }
  process.stdout.write(`文档校验通过：${files.length} 文件，${references} 本地文件／章节引用；未访问外网或扫描归档。\n`);
}
await main().catch(reportFailure);
