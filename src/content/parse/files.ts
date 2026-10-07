import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { ContentError, fail, issuesFrom, type ContentLocation } from '../diagnostics.ts';
import { contentLimits } from '../limits.ts';
import { idPattern } from '../schema/primitives.ts';
import { sourceText, type SourceText } from './source-text.ts';

export interface ResourceDirectory {
  readonly absolutePath: string;
  readonly id: string;
}

export function fileLocation(id: string, path: string): ContentLocation {
  return { resourceId: id, file: `content/resources/${id}/${path}`, line: 1, column: 1, field: '$' };
}

export function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isWithin(base: string, target: string): boolean {
  const path = relative(base, target);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

/** 每个路径段先检查，不接受 Git symlink 或 Windows junction；不扫描资产目录里的未引用文件。 */
async function safeFilePath(base: string, path: string, location: ContentLocation): Promise<string> {
  const parts = path.split('/');
  if (isAbsolute(path) || /[\\\u0000]/u.test(path) || parts.some((part) => !part || part === '.' || part === '..')) {
    fail(location, 'E_PATH', '文件路径必须在当前资源内，不能包含绝对路径、反斜杠、. 或 ..');
  }
  const baseInfo = await lstat(base);
  if (!baseInfo.isDirectory() || baseInfo.isSymbolicLink()) fail(location, 'E_PATH', '资源目录不能是符号链接或 junction');
  for (let length = 1; length <= parts.length; length += 1) {
    const parent = join(base, ...parts.slice(0, length - 1));
    const names = await readdir(parent);
    if (!names.includes(parts[length - 1] ?? '')) fail(location, 'E_PATH', '文件路径必须与实际文件名大小写一致');
    const info = await lstat(join(base, ...parts.slice(0, length)));
    if (info.isSymbolicLink()) fail(location, 'E_PATH', '文件及其父目录不能是符号链接或 junction');
    if (length < parts.length && !info.isDirectory()) fail(location, 'E_PATH', '文件的父路径不是目录');
    if (length === parts.length && !info.isFile()) fail(location, 'E_PATH', '只能读取普通文件');
  }
  const target = await realpath(join(base, ...parts));
  if (!isWithin(await realpath(base), target)) fail(location, 'E_PATH', '文件解析后越出当前资源目录');
  return target;
}

export async function readSafeFile(base: string, path: string, limit: number, location: ContentLocation): Promise<Buffer> {
  try {
    const absolutePath = await safeFilePath(base, path, location);
    const handle = await open(absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile()) fail(location, 'E_PATH', '只能读取普通文件');
      if (info.size > limit) fail(location, 'E_BUDGET', `文件超过 ${limit} 字节维护预算`);
      let chunks: readonly Buffer[] = [];
      let size = 0;
      while (size <= limit) {
        const chunk = Buffer.alloc(Math.min(contentLimits.readChunkBytes, limit + 1 - size));
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, size);
        if (!bytesRead) break;
        size += bytesRead;
        chunks = [...chunks, chunk.subarray(0, bytesRead)];
      }
      if (size > limit) fail(location, 'E_BUDGET', `实际读取超过 ${limit} 字节维护预算`);
      return Buffer.concat(chunks, size);
    } finally {
      await handle.close();
    }
  } catch (error) {
    throw new ContentError(issuesFrom(error, location));
  }
}

export async function readResourceText(directory: ResourceDirectory, file: string, optional = false): Promise<SourceText | undefined> {
  const location = fileLocation(directory.id, file);
  if (optional) {
    try { await lstat(join(directory.absolutePath, file)); }
    catch (error) {
      if (isMissingFile(error)) return undefined;
      throw new ContentError(issuesFrom(error, location));
    }
  }
  const bytes = await readSafeFile(directory.absolutePath, file, contentLimits.textBytes, location);
  try {
    return sourceText(new TextDecoder('utf-8', { fatal: true }).decode(bytes), directory.id, location.file);
  } catch (error) {
    if (error instanceof ContentError) throw error;
    fail(location, 'E_ENCODING', '文件必须使用有效 UTF-8 编码');
  }
}

export async function discoverResources(projectRoot: string): Promise<readonly ResourceDirectory[]> {
  const location: ContentLocation = { resourceId: 'site', file: 'content/resources', line: 1, column: 1, field: '$' };
  try {
    const root = await realpath(projectRoot);
    for (const path of ['content', 'content/resources']) {
      const info = await lstat(join(root, path));
      if (!info.isDirectory() || info.isSymbolicLink()) fail(location, 'E_PATH', `${path} 必须是普通目录`);
    }
    const contentRoot = join(root, 'content/resources');
    const entries = (await readdir(contentRoot, { withFileTypes: true })).filter((entry) => entry.name !== '.gitkeep');
    const issues = entries.flatMap((entry) => {
      if (entry.isDirectory() && !entry.isSymbolicLink() && idPattern.test(entry.name) && entry.name.length <= 80) return [];
      return [{ ...location, file: `content/resources/${entry.name}`, code: 'E_DIRECTORY', message: '内容根只接收有效资源 ID 命名的普通目录（另允许 .gitkeep）' }];
    });
    if (issues.length) throw new ContentError(issues);
    return entries.map((entry) => ({ id: entry.name, absolutePath: join(contentRoot, entry.name) }))
      .toSorted((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  } catch (error) {
    throw new ContentError(issuesFrom(error, location));
  }
}
