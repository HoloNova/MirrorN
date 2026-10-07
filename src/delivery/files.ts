import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const manifestName = 'build-info.json';
const maxArtifactFiles = 10_000;
const maxTextBytes = 4 * 1024 * 1024;

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 只遍历本次输出树；禁止 symlink/junction，避免检查产物时越出目录。 */
export async function outputFiles(root: string, prefix = ''): Promise<readonly string[]> {
  const info = await lstat(join(root, prefix));
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`产物目录不是普通目录：${prefix || 'dist'}`);
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  let files: readonly string[] = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`产物不能包含符号链接：${path}`);
    if (entry.isDirectory()) files = [...files, ...await outputFiles(root, path)];
    else if (entry.isFile()) files = [...files, path];
    else throw new Error(`产物只能包含普通文件：${path}`);
    if (files.length > maxArtifactFiles) throw new Error(`产物超过 ${maxArtifactFiles} 个文件维护预算`);
  }
  return files.toSorted();
}

export async function fileRecord(root: string, path: string) {
  const info = await lstat(join(root, path));
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`产物不是普通文件：${path}`);
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(join(root, path))) {
    const bytes = chunk as Buffer;
    hash.update(bytes);
    size += bytes.length;
  }
  if (size !== info.size) throw new Error(`检查过程中产物发生变化：${path}`);
  return Object.freeze({ path, size, sha256: hash.digest('hex') });
}

export async function textFile(root: string, path: string): Promise<string> {
  const info = await lstat(join(root, path));
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxTextBytes) {
    throw new Error(`文本产物不符合普通文件／${maxTextBytes} 字节预算：${path}`);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(await readFile(join(root, path)));
}
