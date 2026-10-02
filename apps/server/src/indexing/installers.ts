import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  beginRun,
  failRun,
  publishRun,
  registerSoftware,
  stageDownloads,
  type Download,
} from '../db/installers.js';
import { PKU_ORIGIN, sourceUrl } from './policy.js';
import { SourceClient, SourceError } from './source.js';
import { SOFTWARE } from './software.js';
import { compareRepoVersions } from './versions.js';

export type InstallerFamily = 'node' | 'miniconda' | 'anaconda' | 'r' | 'apache';
export type InstallerJob =
  | { kind: 'refresh' }
  | { kind: 'apache'; epoch: number }
  | {
      kind: 'directory';
      software: string;
      family: InstallerFamily;
      directory: string;
      epoch: number;
      depth: number;
    };
export type InstallerEnqueue = (jobs: InstallerJob[]) => Promise<void>;

/** 只登记软件身份/目录入口/命名规则；文件名、版本和链接都从后台请求发现。 */
export function registerInstallers(db: DatabaseSync) {
  for (const software of SOFTWARE) registerSoftware(db, software);
}
export function installerTaskKey(job: InstallerJob): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        job.kind === 'directory'
          ? [job.kind, job.software, job.directory, job.epoch]
          : [job.kind, 'epoch' in job ? job.epoch : 0],
      ),
    )
    .digest('hex');
}

function directoryApi(directory: string) {
  const url = sourceUrl(directory);
  return `${PKU_ORIGIN}/files${url.pathname}`;
}
function safeName(name: string) {
  return (
    name.length > 0 &&
    name !== '.' &&
    name !== '..' &&
    !['/', '#', '?', '\\'].some((part) => name.includes(part)) &&
    !Array.from(name).some((part) => part.charCodeAt(0) < 32 || part.charCodeAt(0) === 127) &&
    !/%(?:2f|5c|2e)/i.test(name)
  );
}
interface Entry {
  name: string;
  type: string;
  size?: number;
}
async function entries(source: SourceClient, directory: string): Promise<Entry[]> {
  const raw = await source.json(directoryApi(directory));
  if (!Array.isArray(raw)) throw new SourceError('软件目录不是完整JSON文件列表', false);
  return raw.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new SourceError('文件列表条目无效', false);
    const row = entry as Entry;
    if (typeof row.name !== 'string' || typeof row.type !== 'string' || !safeName(row.name))
      throw new SourceError('文件列表身份无效', false);
    return {
      name: row.name,
      type: row.type,
      ...(typeof row.size === 'number' && Number.isSafeInteger(row.size) && row.size >= 0
        ? { size: row.size }
        : {}),
    };
  });
}
function arch(value: string | undefined) {
  if (value === 'x86_64' || value === 'amd64') return 'x64';
  if (value === 'aarch64') return 'arm64';
  return value ?? 'unknown';
}

/** 格式是最后一道检查，不能把任意.tar.gz/zip当成可安装软件。 */
export function recognizeInstaller(
  family: InstallerFamily,
  filename: string,
): Omit<Download, 'filename' | 'url' | 'size'> | undefined {
  if (
    /\b(?:headers|source|src|sources|debug|symbols|javadoc|tests|test|docs|examples)\b/i.test(
      filename,
    )
  )
    return undefined;
  if (family === 'node') {
    const match = /^node-(v\d+\.\d+\.\d+(?:-(?:rc|beta|alpha|pre|nightly)[\w.]*)?)(.*)$/.exec(
      filename,
    );
    if (!match) return undefined;
    const version = match[1]!;
    const tail = match[2]!;
    const msi = /^-(x64|x86|arm64)\.msi$/.exec(tail);
    if (msi) return { version, platform: 'windows', arch: msi[1]!, format: 'msi' };
    if (tail === '.pkg') return { version, platform: 'macos', arch: 'unknown', format: 'pkg' };
    if (tail === '.msi') return { version, platform: 'windows', arch: 'unknown', format: 'msi' };
    const pkg = /^-(darwin)-(x64|arm64)\.pkg$/.exec(tail);
    if (pkg) return { version, platform: 'macos', arch: pkg[2]!, format: 'pkg' };
    const binary = /^-(linux|darwin|win)-([a-z\d_]+)\.(tar\.xz|tar\.gz|zip)$/.exec(tail);
    if (!binary || (binary[1] === 'win') !== (binary[3] === 'zip')) return undefined;
    return {
      version,
      platform: binary[1] === 'linux' ? 'linux' : binary[1] === 'darwin' ? 'macos' : 'windows',
      arch: arch(binary[2]),
      format: binary[3]!,
    };
  }
  if (family === 'miniconda' || family === 'anaconda') {
    const prefix = family === 'miniconda' ? 'Miniconda' : 'Anaconda';
    const match = new RegExp(
      `^${prefix}[23]-(.+)-(Windows|MacOSX|Linux)-(x86_64|x86|aarch64|arm64|ppc64le)\\.(exe|pkg|sh)$`,
    ).exec(filename);
    if (!match) return undefined;
    const platform = match[2] === 'Windows' ? 'windows' : match[2] === 'MacOSX' ? 'macos' : 'linux';
    if (
      (platform === 'windows' && match[4] !== 'exe') ||
      (platform === 'linux' && match[4] !== 'sh') ||
      (platform === 'macos' && !['pkg', 'sh'].includes(match[4]!))
    )
      return undefined;
    return {
      version: match[1]!.replace(/^py\d+_/, ''),
      platform,
      arch: arch(match[3]),
      format: match[4]!,
    };
  }
  if (family === 'r') {
    const match = /^R-(\d+\.\d+(?:\.\d+)?)(?:-(arm64|x86_64))?(?:-(win))?\.(exe|pkg)$/.exec(
      filename,
    );
    if (!match || (match[3] === 'win') !== (match[4] === 'exe')) return undefined;
    return {
      version: match[1]!,
      platform: match[4] === 'exe' ? 'windows' : 'macos',
      arch: arch(match[2]),
      format: match[4]!,
    };
  }
  // Apache项目只接受明确标为bin/binary的发行包，不猜测未标识归档用途。
  const binary =
    /^(?:apache-)?[a-z][\w.-]*?-(\d+(?:\.\d+)+(?:[-.][\w]+)*?)[-_](?:bin|binary)(?:-[\w.-]+)?\.(tar\.gz|tar\.xz|tgz|zip)$/i.exec(
      filename,
    );
  if (!binary) return undefined;
  return { version: binary[1]!, platform: 'any', arch: 'any', format: binary[2]! };
}

function descend(job: Extract<InstallerJob, { kind: 'directory' }>, name: string): boolean {
  if (job.family === 'miniconda' || job.family === 'anaconda') return false;
  if (job.family === 'node') return job.depth === 0 && /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(name);
  if (job.family === 'r')
    return /^(?:base|old|[\d.]+|[\w-]*(?:arm64|x86_64)|leopard|tiger|el-capitan)$/.test(name);
  const project = job.software.replace(/^apache-/, '');
  return (
    /^(?:v?\d[\w.-]*|binaries|bin|releases?|dist|linux|windows|macos)$/i.test(name) ||
    name === project ||
    name === `apache-${project}` ||
    new RegExp(`^(?:apache-)?${project}-\\d`, 'i').test(name)
  );
}

export async function executeInstallerJob(
  db: DatabaseSync,
  job: InstallerJob,
  source: SourceClient,
  enqueue: InstallerEnqueue,
) {
  if (job.kind === 'refresh') {
    const epoch = Date.now();
    registerInstallers(db);
    db.prepare("DELETE FROM catalog_runs WHERE state<>'staging' AND finished_at<?").run(
      epoch - 7 * 86400000,
    );
    const roots: [string, InstallerFamily, string][] = [
      ['nodejs', 'node', 'nodejs-release/'],
      ['anaconda-installer', 'miniconda', 'anaconda/miniconda/'],
      ['anaconda-distribution', 'anaconda', 'anaconda/archive/'],
      ['r-cran', 'r', 'CRAN/bin/windows/base/'],
      ['r-cran', 'r', 'CRAN/bin/macosx/'],
    ];
    await enqueue([
      ...roots.map(([software, family, path]): InstallerJob => ({
        kind: 'directory',
        software,
        family,
        directory: `${PKU_ORIGIN}/${path}`,
        epoch,
        depth: 0,
      })),
      { kind: 'apache', epoch },
    ]);
    return { discovered: roots.length + 1 };
  }
  if (job.kind === 'apache') {
    const projects = await entries(source, `${PKU_ORIGIN}/apache/`);
    if (!projects.length) throw new SourceError('Apache项目清单为空', true);
    const jobs: InstallerJob[] = [];
    for (const project of projects) {
      if (
        project.type !== 'directory' ||
        !/^[a-z][a-z\d_-]+$/i.test(project.name) ||
        ['dist', 'HEADER', 'icons'].includes(project.name)
      )
        continue;
      const slug = `apache-${project.name.toLowerCase()}`;
      registerSoftware(db, {
        slug,
        resourceKey: slug,
        name: `Apache ${project.name}`,
        aliases: ['apache', project.name],
        category: 'other',
        repo: 'apache',
      });
      jobs.push({
        kind: 'directory',
        software: slug,
        family: 'apache',
        directory: `${PKU_ORIGIN}/apache/${project.name}/`,
        epoch: job.epoch,
        depth: 0,
      });
    }
    await enqueue(jobs);
    return { discovered: jobs.length };
  }
  const software = db
    .prepare('SELECT slug,repo FROM catalog_software WHERE slug=?')
    .get(job.software) as { slug: string; repo: string } | undefined;
  if (!software) throw new SourceError('软件身份尚未登记', false);
  const root = `${PKU_ORIGIN}/${software.repo}/`;
  const directory = sourceUrl(job.directory, root);
  if (!directory.pathname.endsWith('/') || directory.search || job.depth > 16)
    throw new SourceError('软件目录范围异常，未发布', false);
  if (
    job.depth > 0 &&
    !db
      .prepare(
        `SELECT 1 FROM catalog_scopes s JOIN catalog_software w ON w.id=s.software_id
    JOIN catalog_sites t ON t.id=s.site_id WHERE w.slug=? AND t.slug='pku' AND s.directory=? AND s.enabled=1 AND s.discovered_epoch=?`,
      )
      .get(software.slug, directory.href, job.epoch)
  )
    throw new SourceError('子目录未被当前有效父目录确认，不执行遗留待办', false);
  const run = beginRun(db, 'pku', software.slug, directory.href, job.epoch);
  const requests = source.requests,
    bytes = source.bytes;
  try {
    const listing = await entries(source, directory.href);
    if (!listing.length) throw new SourceError('软件目录异常为空，保留有效数据', true);
    const next: InstallerJob[] = [];
    const files: Download[] = [];
    for (const entry of listing) {
      if (entry.type === 'directory') {
        if (descend(job, entry.name))
          next.push({
            ...job,
            directory: `${directory.href}${encodeURIComponent(entry.name)}/`,
            depth: job.depth + 1,
          });
      } else {
        const recognized = recognizeInstaller(job.family, entry.name);
        const project = job.software.replace(/^apache-/, '');
        const product = /^(?:apache-)?(.+?)-\d+(?:\.\d)+/i.exec(entry.name)?.[1]?.toLowerCase();
        const belongs = job.family !== 'apache' || product === project;
        if (recognized && belongs)
          files.push({
            ...recognized,
            filename: entry.name,
            url: `${directory.href}${encodeURIComponent(entry.name)}`,
            ...(entry.size === undefined ? {} : { size: entry.size }),
          });
      }
    }
    next.sort((a, b) =>
      a.kind === 'directory' && b.kind === 'directory'
        ? compareRepoVersions(
            software.repo,
            b.directory.split('/').at(-2)!,
            a.directory.split('/').at(-2)!,
          )
        : 0,
    );
    if (!files.length && !next.length)
      throw new SourceError('没有可识别的安装文件或版本目录，保留有效数据', false);
    stageDownloads(db, run, files);
    // 子任务持久化成功才发布当前范围；不会因入队中断删除旧文件。
    await enqueue(next);
    const count = publishRun(
      db,
      run,
      Date.now(),
      next.map((child) => (child as Extract<InstallerJob, { kind: 'directory' }>).directory),
    );
    db.prepare('UPDATE catalog_runs SET requests=?,network_bytes=? WHERE id=?').run(
      source.requests - requests,
      source.bytes - bytes,
      run,
    );
    return { files: count, discovered: next.length };
  } catch (error) {
    failRun(db, run, error);
    throw error;
  }
}
