import { createHash } from 'node:crypto';
import { rememberProjects } from './projectRegistry.js';
import type { DatabaseSync } from 'node:sqlite';
import { JSONParser } from '@streamparser/json';
import { beginSnapshot, stageFiles, publishSnapshot, rejectSnapshot } from '../db/snapshots.js';
import { parseArtifactFilename } from './filenames.js';
import { apkFiles, firmwareFiles, juliaRegistryFiles, texliveFiles } from './extraParsers.js';
import { PKU_ORIGIN, sourceUrl, type IndexedFile, type ScopeSpec } from './policy.js';
import { collector, type Enqueue, type IndexJob } from './jobs.js';
import { SourceClient, SourceError, chunks } from './source.js';
import {
  aptFile,
  aptIndexes,
  controlRecords,
  normalizePythonName,
  parseAnchors,
  pythonFile,
  rpmPrimaryLocation,
  rpmFiles,
  pacmanFiles,
} from './parsers.js';

type Task = Exclude<
  IndexJob,
  { kind: 'refresh' } | { kind: 'catalog' } | { kind: 'pypi-dispatch' }
>;
type Entry = { name: string; type: string; size?: number; mtime?: string };
const directoryIndex = (url: string) => `${PKU_ORIGIN}/files${sourceUrl(url).pathname}`;
const safeName = (value: string) =>
  value.length > 0 &&
  value !== '.' &&
  value !== '..' &&
  !/[\\/]/.test(value) &&
  Array.from(value).every((char) => char.codePointAt(0)! >= 32) &&
  !/%(?:2f|5c|2e)/i.test(value);

function rootTask(resourceId: string, repo: string, discoveryEpoch = Date.now()): Task {
  const protocol = collector(repo);
  const root = `${PKU_ORIGIN}/${repo}/`;
  let base = root;
  if (repo === 'anthon') base += 'debs/';
  if (repo === 'termux') base += 'termux-main/';
  if (protocol === 'texlive')
    return {
      kind: 'texlive-db',
      discoveryEpoch,
      resourceId,
      protocol,
      indexUrl: `${root}systems/texlive/tlnet/tlpkg/texlive.tlpdb`,
      baseUrl: `${root}systems/texlive/tlnet/`,
    };
  if (protocol === 'julia')
    return {
      kind: 'julia-root',
      discoveryEpoch,
      resourceId,
      protocol,
      indexUrl: `${root}registries`,
      baseUrl: root,
    };
  const kind = protocol === 'pypi' ? 'pypi-root' : 'directory';
  const index =
    protocol === 'apt'
      ? directoryIndex(`${base}dists/`)
      : protocol === 'pypi'
        ? `${root}web/simple/`
        : directoryIndex(base);
  return {
    kind,
    resourceId,
    protocol,
    indexUrl: index,
    baseUrl: base,
    lineage: [],
    discoveryEpoch,
  };
}

/** 一次队列任务对应一个完整目录或协议索引；下层工作单独持久化入队，绝不截取前几个版本。 */
export async function executeIndexJob(
  db: DatabaseSync,
  task: IndexJob,
  jobIdentity: string,
  source: SourceClient,
  enqueue: Enqueue,
) {
  if (task.kind === 'pypi-dispatch') throw new SourceError('项目派发必须由BullMQ队列执行', false);
  if (task.kind === 'refresh') {
    const rows = db
      .prepare("SELECT id,repo_id AS repo FROM resources WHERE site_id='pku'")
      .all() as { id: string; repo: string }[];
    const tasks: IndexJob[] = [{ kind: 'catalog' }];
    let unsupported = 0;
    for (const row of rows) {
      const protocol = collector(row.repo);
      if (protocol === 'excluded-dataset') {
        unsupported++;
        continue;
      }
      tasks.push(rootTask(row.id, row.repo));
      if (row.repo === 'termux')
        for (const part of ['termux-main-21', 'termux-root', 'termux-x11'])
          tasks.push({
            ...rootTask(row.id, row.repo),
            baseUrl: `${PKU_ORIGIN}/termux/${part}/`,
            indexUrl: directoryIndex(`${PKU_ORIGIN}/termux/${part}/dists/`),
          });
      if (row.repo === 'anthon')
        for (const part of ['debs-retro', 'debs-stage2'])
          tasks.push({
            ...rootTask(row.id, row.repo),
            baseUrl: `${PKU_ORIGIN}/anthon/${part}/`,
            indexUrl: directoryIndex(`${PKU_ORIGIN}/anthon/${part}/dists/`),
          });
    }
    await enqueue(tasks);
    return { discovered: tasks.length, unsupported };
  }
  if (task.kind === 'catalog') {
    const catalog = await source.json(`${PKU_ORIGIN}/monitor/mirrors`);
    if (
      !catalog ||
      typeof catalog !== 'object' ||
      Array.isArray(catalog) ||
      !Object.keys(catalog).length
    )
      throw new SourceError('官方仓库清单无效', false);
    db.exec(
      'CREATE TABLE IF NOT EXISTS upstream_catalog(site_id TEXT PRIMARY KEY,payload TEXT NOT NULL,checked_at INTEGER NOT NULL)',
    );
    let unsupported = 0;
    const updates: { id: string; name: string }[] = [];
    for (const [repo, raw] of Object.entries(catalog)) {
      if (!safeName(repo) || !raw || typeof raw !== 'object')
        throw new SourceError('官方仓库身份无效', false);
      const entry = raw as { name?: string; url?: string };
      if (entry.url) sourceUrl(entry.url, `${PKU_ORIGIN}/`);
      const resource = db
        .prepare("SELECT id FROM resources WHERE site_id='pku' AND repo_id=?")
        .get(repo) as { id: string } | undefined;
      if (!resource) {
        unsupported++;
        continue;
      }
      if (entry.name) updates.push({ id: resource.id, name: entry.name });
    }
    // 官方目录自身也只在完整读取后写库，不根据某次缺项删除其它资料。
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const update of updates)
        db.prepare('UPDATE resources SET name=?,updated_at=? WHERE id=?').run(
          update.name,
          Date.now(),
          update.id,
        );
      db.prepare(
        'INSERT INTO upstream_catalog VALUES(?,?,?) ON CONFLICT(site_id) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at',
      ).run('pku', JSON.stringify(catalog), Date.now());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { catalogued: Object.keys(catalog).length, unsupported };
  }
  if (!task.resourceId.startsWith('pku:')) throw new SourceError('禁止采集未启用站点', false);
  sourceUrl(task.indexUrl);
  sourceUrl(task.baseUrl);

  if (task.kind === 'directory') {
    const payload = await source.json(task.indexUrl);
    task.discoveryEpoch = Date.now();
    if (!Array.isArray(payload)) throw new SourceError('目录不是JSON索引，未发布', false);
    const entries: Entry[] = payload
      .map((raw: unknown) => {
        if (!raw || typeof raw !== 'object') throw new SyntaxError('目录项无效');
        const item = raw as Entry;
        if (typeof item.name !== 'string' || typeof item.type !== 'string')
          throw new SyntaxError('目录项缺少身份');
        return item;
      })
      .filter((e) => safeName(e.name));
    const digest = createHash('sha256')
      .update(JSON.stringify(entries.map((e) => [e.name, e.type, e.size, e.mtime]).sort()))
      .digest('hex');
    if (task.lineage?.includes(digest)) return { alias: true };
    if ((task.lineage?.length ?? 0) > 64) throw new SourceError('目录深度异常，保留旧数据', false);
    const next: IndexJob[] = [];
    const files: IndexedFile[] = [];
    const make = (kind: Task['kind'], indexUrl: string, baseUrl = task.baseUrl): Task => ({
      ...task,
      kind,
      indexUrl,
      baseUrl,
      lineage: [...(task.lineage ?? []), digest],
    });
    if (task.protocol === 'apt') {
      for (const entry of entries.filter((e) => e.type === 'directory'))
        next.push({
          ...make('apt-release', `${task.baseUrl}dists/${encodeURIComponent(entry.name)}/Release`),
          release: entry.name,
        });
    } else {
      const names = new Set(entries.filter((e) => e.type !== 'directory').map((e) => e.name));
      let metadata = false;
      if (task.protocol === 'rpm' && names.has('repomd.xml')) {
        next.push(
          make('rpm-repomd', `${task.baseUrl}repomd.xml`, new URL('../', task.baseUrl).href),
        );
        metadata = true;
      }
      if (task.protocol === 'pacman') {
        const indexes = [...names].filter((n) => /\.db(?:\.tar\.(?:gz|xz))?$/.test(n));
        for (const name of indexes)
          next.push({
            ...make('pacman-db', `${task.baseUrl}${encodeURIComponent(name)}`),
            compression: name.endsWith('.xz') ? 'xz' : 'gzip',
          });
        metadata = indexes.length > 0;
      }
      if (task.protocol === 'opkg') {
        if (names.has('profiles.json'))
          next.push(make('firmware-profiles', `${task.baseUrl}profiles.json`));
        if (names.has('Packages.gz') || names.has('Packages')) {
          next.push(
            make(
              'opkg-packages',
              `${task.baseUrl}${names.has('Packages.gz') ? 'Packages.gz' : 'Packages'}`,
            ),
          );
          metadata = true;
        }
        if (names.has('APKINDEX.tar.gz')) {
          next.push(make('apk-index', `${task.baseUrl}APKINDEX.tar.gz`));
          metadata = true;
        }
        if (names.has('packages.adb'))
          throw new SourceError('发现APK v3二进制索引，适配尚未实现，保留旧数据', false);
      }
      if (task.protocol === 'conda' && names.has('repodata.json')) {
        next.push(make('conda-index', `${task.baseUrl}repodata.json`));
        metadata = true;
      }
      if (task.protocol === 'r' && (names.has('PACKAGES.gz') || names.has('PACKAGES'))) {
        next.push(
          make(
            'r-packages',
            `${task.baseUrl}${names.has('PACKAGES.gz') ? 'PACKAGES.gz' : 'PACKAGES'}`,
          ),
        );
        metadata = true;
      }
      if (!metadata) {
        for (const entry of entries) {
          if (entry.type === 'directory') {
            // 数据包目录没有发现协议索引的作用，不逐个扫描包体、文档或源码树。
            if (
              ['rpm', 'pacman'].includes(task.protocol) &&
              /^(packages|pool|srpms|drpms|debug|source)$/i.test(entry.name)
            )
              continue;
            if (
              task.protocol === 'conda' &&
              task.baseUrl === `${PKU_ORIGIN}/anaconda/` &&
              !['miniconda', 'archive', 'pkgs', 'cloud'].includes(entry.name)
            )
              continue;
            if (
              task.protocol === 'r' &&
              task.baseUrl === `${PKU_ORIGIN}/CRAN/` &&
              !['src', 'bin'].includes(entry.name)
            )
              continue;
            const base = `${task.baseUrl}${encodeURIComponent(entry.name)}/`;
            next.push(make('directory', directoryIndex(base), base));
          } else {
            const file = directoryFile(task, entry);
            if (file) files.push(file);
          }
        }
      }
    }
    // 入队失败可重试父任务；子任务ID稳定，已入队部分不重复。父目录没有文件时不清空旧快照。
    await enqueue(next);
    if (files.length)
      await publish(db, task, jobIdentity, async (accept) => {
        for (const file of files) accept(file);
        return digest;
      });
    return { files: files.length, discovered: next.length };
  }

  if (task.kind === 'julia-root') {
    const pointers = (await source.text(task.indexUrl)).trim().split(/\s+/);
    task.discoveryEpoch = Date.now();
    const jobs = pointers.map((pointer) => {
      const match = /^\/registry\/([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})\/([\da-f]{40})$/i.exec(
        pointer,
      );
      if (!match) throw new SyntaxError('Julia注册表入口无效');
      return {
        ...task,
        kind: 'julia-registry' as const,
        indexUrl: sourceUrl(pointer.slice(1), task.baseUrl).href,
        component: match[1],
        compression: 'gzip' as const,
      };
    });
    await enqueue(jobs);
    return { discovered: jobs.length };
  }
  if (task.kind === 'firmware-profiles') {
    const payload = await source.json(task.indexUrl);
    task.discoveryEpoch = Date.now();
    const files = await publish(db, task, jobIdentity, async (accept) => {
      firmwareFiles(payload, task.baseUrl, accept);
      return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    });
    return { files };
  }
  if (task.kind === 'apt-release') {
    const release = await source.text(task.indexUrl);
    task.discoveryEpoch = Date.now();
    const indexes = aptIndexes(release);
    await enqueue(
      indexes.map((index) => ({
        ...task,
        kind: 'apt-packages',
        indexUrl: sourceUrl(index.path, new URL('./', task.indexUrl).href).href,
        release: task.release ?? index.release,
        component: index.component,
        architecture: index.architecture,
        expected: { size: index.size, sha256: index.sha256 },
      })),
    );
    return { discovered: indexes.length };
  }
  if (task.kind === 'rpm-repomd') {
    const primary = rpmPrimaryLocation(await source.text(task.indexUrl));
    task.discoveryEpoch = Date.now();
    await enqueue([
      {
        ...task,
        kind: 'rpm-primary',
        indexUrl: sourceUrl(primary.href, task.baseUrl).href,
        expected: { size: primary.size, sha256: primary.sha256 },
      },
    ]);
    return { discovered: 1 };
  }
  if (task.kind === 'pypi-root') {
    task.discoveryEpoch = Date.now();
    let pending: { name: string; indexUrl: string }[] = [];
    let discovered = 0;
    let complete = false;
    const flush = async () => {
      if (pending.length) {
        rememberProjects(db, pending);
        discovered += pending.length;
        pending = [];
      }
    };
    await source.consume(task.indexUrl, async (stream) => {
      const parser = new (await import('htmlparser2')).Parser(
        {
          onclosetag: (name, implied) => {
            if (name === 'html' && !implied) complete = true;
          },
          onopentag: (name, attrs) => {
            if (name !== 'a' || !attrs.href) return;
            const url = sourceUrl(new URL(attrs.href, task.indexUrl).href, task.indexUrl);
            const pkg = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? '');
            if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(pkg)) throw new SyntaxError('PyPI包名不合法');
            pending.push({ name: normalizePythonName(pkg), indexUrl: url.href });
          },
        },
        { decodeEntities: true },
      );
      const decoder = new TextDecoder();
      for await (const chunk of chunks(stream)) {
        parser.write(decoder.decode(chunk, { stream: true }));
        if (pending.length >= 500) await flush();
      }
      parser.end(decoder.decode());
      if (!complete) throw new SyntaxError('PyPI根索引未完整结束');
      await flush();
    });
    if (!discovered) throw new SourceError('PyPI项目清单为空', false);
    return { discovered };
  }

  const count = await publish(db, task, jobIdentity, async (accept) => {
    const result = await source.consume(
      task.indexUrl,
      async (stream) => {
        if (task.kind === 'apt-packages')
          for await (const record of controlRecords(stream)) accept(aptFile(record, task.baseUrl));
        else if (task.kind === 'opkg-packages') {
          for await (const row of controlRecords(stream)) {
            if (!row.Package || !row.Version || !row.Filename || !/\.(ipk|apk)$/.test(row.Filename))
              throw new SyntaxError('opkg实际包身份缺失');
            accept({
              packageName: row.Package,
              version: row.Version,
              filename: row.Filename,
              url: sourceUrl(row.Filename, task.baseUrl).href,
              size: row.Size ? Number(row.Size) : null,
              role: 'package',
              platform: 'linux',
              arch: row.Architecture ?? 'unknown',
              format: row.Filename.endsWith('.ipk') ? 'ipk' : 'apk',
              ...(row.SHA256sum ? { checksum: { algorithm: 'sha256', value: row.SHA256sum } } : {}),
              compatibility: { depends: row.Depends ?? '' },
            });
          }
        } else if (task.kind === 'texlive-db') await texliveFiles(stream, task.baseUrl, accept);
        else if (task.kind === 'julia-registry')
          await juliaRegistryFiles(stream, task.baseUrl, accept);
        else if (task.kind === 'apk-index') await apkFiles(stream, task.baseUrl, accept);
        else if (task.kind === 'pypi-project')
          await parseAnchors(stream, (attrs) => {
            const file = pythonFile(attrs, task.indexUrl, task.component ?? '');
            if (file) accept(file);
          });
        else if (task.kind === 'rpm-primary') await rpmFiles(stream, task.baseUrl, accept);
        else if (task.kind === 'pacman-db') await pacmanFiles(stream, task.baseUrl, accept);
        else if (task.kind === 'r-packages') {
          for await (const record of controlRecords(stream)) {
            if (!record.Package || !record.Version) throw new SyntaxError('R包身份缺失');
            const filename =
              record.File ??
              `${record.Package}_${record.Version}${task.baseUrl.includes('/bin/windows/') ? '.zip' : task.baseUrl.includes('/bin/macosx/') ? '.tgz' : '.tar.gz'}`;
            const url = sourceUrl(filename, task.baseUrl);
            accept({
              packageName: record.Package,
              version: record.Version,
              filename,
              url: url.href,
              size: null,
              role: 'package',
              platform: task.baseUrl.includes('/bin/windows/')
                ? 'windows'
                : task.baseUrl.includes('/bin/macosx/')
                  ? 'macos'
                  : 'any',
              arch: task.architecture ?? 'unknown',
              format: filename.endsWith('.zip')
                ? 'zip'
                : filename.endsWith('.tgz')
                  ? 'tgz'
                  : 'tar.gz',
              compatibility: { depends: record.Depends ?? '', imports: record.Imports ?? '' },
            });
          }
        } else if (task.kind === 'conda-index') {
          const parser = new JSONParser({ paths: ['$.*.*'], keepStack: false });
          let ended = false;
          parser.onValue = ({ value, key, stack }) => {
            if (!stack.some((s) => s.key === 'packages' || s.key === 'packages.conda')) return;
            if (!value || typeof value !== 'object') throw new SyntaxError('conda包记录无效');
            const rec = value as Record<string, unknown>;
            const filename = String(key);
            if (!rec.name || !rec.version || !/\.(?:tar\.bz2|conda)$/.test(filename))
              throw new SyntaxError('conda包字段缺失');
            const url = sourceUrl(filename, task.baseUrl);
            accept({
              packageName: String(rec.name),
              version: String(rec.version),
              filename,
              url: url.href,
              size: typeof rec.size === 'number' ? rec.size : null,
              role: 'package',
              platform: task.baseUrl.includes('/win-')
                ? 'windows'
                : task.baseUrl.includes('/osx-')
                  ? 'macos'
                  : task.baseUrl.includes('/linux-')
                    ? 'linux'
                    : 'any',
              arch: String(rec.arch ?? 'unknown'),
              format: filename.endsWith('.conda') ? 'conda' : 'tar.bz2',
              ...(typeof rec.sha256 === 'string'
                ? { checksum: { algorithm: 'sha256', value: rec.sha256 } }
                : {}),
              compatibility: { build: rec.build, depends: rec.depends, subdir: rec.subdir },
            });
          };
          parser.onEnd = () => {
            ended = true;
          };
          for await (const chunk of chunks(stream)) parser.write(chunk);
          if (!parser.isEnded) parser.end();
          if (!ended) throw new SyntaxError('conda索引未完整结束');
        }
      },
      task.expected,
      task.compression,
    );
    return result.digest;
  });
  return { files: count };
}

async function publish(
  db: DatabaseSync,
  scope: ScopeSpec,
  identity: string,
  parse: (accept: (file: IndexedFile) => void) => Promise<string>,
) {
  const snapshot = beginSnapshot(db, scope, identity);
  if (snapshot.alreadyPublished) return 0;
  let batch: IndexedFile[] = [];
  const flush = () => {
    if (batch.length) {
      stageFiles(db, snapshot.id, batch);
      batch = [];
    }
  };
  try {
    const digest = await parse((file) => {
      batch.push(file);
      if (batch.length >= 250) flush();
    });
    flush();
    return publishSnapshot(db, snapshot.id, digest);
  } catch (error) {
    rejectSnapshot(db, snapshot.id, error);
    throw error;
  }
}

function directoryFile(task: Task, entry: Entry): IndexedFile | undefined {
  const repo = task.resourceId.slice(4);
  const isInstaller =
    repo === 'nodejs-release' ||
    (repo === 'anaconda' && /\/(miniconda|archive)\/$/.test(task.baseUrl));
  const isISO = ['ubuntu-releases', 'ubuntu-cdimage', 'debian-cd', 'opnsense'].includes(repo);
  const isFirmware = repo === 'debian-nonfree';
  const isArchive = repo === 'apache';
  const isTex =
    task.protocol === 'texlive' && /\/systems\/texlive\/tlnet\/archive\/$/.test(task.baseUrl);
  if (!isInstaller && !isISO && !isFirmware && !isArchive && !isTex) return undefined;
  const parsed = parseArtifactFilename(entry.name);
  if (!parsed) return undefined;
  if (isInstaller && repo === 'anaconda' && !/^(Miniconda|Anaconda)/.test(entry.name))
    return undefined;
  if (isISO && !/\.(iso|img)(\.(gz|xz|bz2))?$/.test(entry.name)) return undefined;
  if (isFirmware && !/\.(deb|tar\.gz|tar\.xz|zip|cpio\.gz)$/.test(entry.name)) return undefined;
  const url = sourceUrl(encodeURIComponent(entry.name), task.baseUrl);
  return {
    ...parsed,
    packageName: isInstaller
      ? repo === 'nodejs-release'
        ? 'nodejs'
        : /^Miniconda/i.test(entry.name)
          ? 'miniconda'
          : 'anaconda'
      : '',
    filename: entry.name,
    url: url.href,
    size: entry.size ?? null,
    role: isInstaller
      ? 'installer'
      : isISO
        ? 'iso'
        : isFirmware
          ? 'firmware'
          : isTex
            ? 'package'
            : 'source',
    ...(entry.mtime ? { mtime: entry.mtime } : {}),
  };
}
