import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { BuildMode } from '../../config/deployment.ts';
import type { ResourceRegistry } from '../content/registry/types.ts';
import { fileRecord, manifestName, outputFiles, sha256 } from './files.ts';

const exec = promisify(execFile);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const outputPathSchema = z.string().refine((path) => !path.startsWith('/') && !/[\\\u0000]/u.test(path)
  && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'), '必须是产物内相对路径');

export const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.enum(['preview', 'release']),
  siteUrl: z.url().nullable(),
  commit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/).nullable(),
  dirty: z.boolean().nullable(),
  contentHash: digestSchema,
  artifactHash: digestSchema,
  files: z.array(z.strictObject({ path: outputPathSchema, size: z.number().int().nonnegative(), sha256: digestSchema })),
});
export type BuildManifest = z.infer<typeof manifestSchema>;

export function contentDigest(registry: ResourceRegistry): string {
  return sha256(JSON.stringify(registry.resources.toSorted((a, b) => a.metadata.id < b.metadata.id ? -1 : a.metadata.id > b.metadata.id ? 1 : 0)));
}

/** 未安装 Git 的源码包仍可预览；正式产物必须对应明确的干净修订。 */
export async function sourceRevision(root: string) {
  try {
    const options = { cwd: root, timeout: 10_000, maxBuffer: 1024 * 1024 };
    const { stdout: commit } = await exec('git', ['rev-parse', 'HEAD'], options);
    const { stdout: status } = await exec('git', ['status', '--porcelain', '--untracked-files=all'], options);
    return { commit: commit.trim(), dirty: status.trim() !== '' };
  } catch (error) {
    process.stderr.write(`Git 修订不可读取，预览标识留空：${error instanceof Error ? error.message : String(error)}\n`);
    return { commit: null, dirty: null };
  }
}

export async function writeBuildManifest(root: string, out: string, registry: ResourceRegistry, mode: BuildMode, siteUrl: string | null): Promise<BuildManifest> {
  const revision = await sourceRevision(root);
  if (mode === 'release' && (!revision.commit || revision.dirty !== false)) {
    throw new Error('正式构建需要 Git 中已提交的干净源码修订；请先完成审核与提交。');
  }
  const paths = (await outputFiles(out)).filter((path) => path !== manifestName);
  let files: readonly Awaited<ReturnType<typeof fileRecord>>[] = [];
  for (const path of paths) files = [...files, await fileRecord(out, path)];
  const payload = { schemaVersion: 1 as const, mode, siteUrl, ...revision, contentHash: contentDigest(registry), files };
  const manifest = manifestSchema.parse({ ...payload, artifactHash: sha256(JSON.stringify(payload)) });
  await writeFile(join(out, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
