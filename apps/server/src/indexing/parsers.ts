import { Parser } from 'htmlparser2';
import { XMLParser } from 'fast-xml-parser';
import { extract } from 'tar-stream';
import { Readable } from 'node:stream';
import type { IndexedFile } from './policy.js';
import { normalizePythonName, sourceUrl } from './policy.js';
import { textChunks, chunks } from './source.js';

export function controlRecord(block: string): Record<string, string> {
  const record: Record<string, string> = {};
  let key = '';
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && key) record[key] += `\n${line.trim()}`;
    else {
      const colon = line.indexOf(':');
      if (colon > 0) {
        key = line.slice(0, colon);
        record[key] = line.slice(colon + 1).trim();
      }
    }
  }
  return record;
}
export async function* controlRecords(stream: ReadableStream<Uint8Array>) {
  let pending = '';
  for await (const chunk of textChunks(stream)) {
    pending += chunk.replace(/\r/g, '');
    let end: number;
    while ((end = pending.indexOf('\n\n')) >= 0) {
      const block = pending.slice(0, end);
      pending = pending.slice(end + 2);
      if (block.trim()) yield controlRecord(block);
    }
    if (pending.length > 2 * 1024 * 1024) throw new SyntaxError('单个包记录过大');
  }
  if (pending.trim()) yield controlRecord(pending);
}

export function aptFile(record: Record<string, string>, root: string): IndexedFile {
  const name = record.Package,
    version = record.Version,
    architecture = record.Architecture,
    filename = record.Filename;
  if (
    !name ||
    !version ||
    !architecture ||
    !filename ||
    !/\.(deb|udeb)$/.test(filename) ||
    !/^\d+$/.test(record.Size ?? '')
  )
    throw new SyntaxError('Packages必需字段不完整');
  const url = sourceUrl(filename, root);
  return {
    packageName: name,
    version,
    arch: architecture,
    platform: 'linux',
    format: filename.endsWith('.udeb') ? 'udeb' : 'deb',
    filename: decodeURIComponent(url.pathname.split('/').at(-1)!),
    url: url.href,
    size: Number(record.Size),
    role: 'package',
    ...(record.SHA256 ? { checksum: { algorithm: 'sha256', value: record.SHA256 } } : {}),
    compatibility: {
      depends: record.Depends ?? '',
      preDepends: record['Pre-Depends'] ?? '',
      section: record.Section ?? '',
    },
  };
}

export interface AptIndex {
  path: string;
  size: number;
  sha256: string;
  release: string;
  component: string;
  architecture: string;
}
export function aptIndexes(body: string): AptIndex[] {
  const release = controlRecord(body);
  const indexes = new Map<string, AptIndex>();
  if (!release.Suite && !release.Codename) throw new SyntaxError('Release缺少发行版身份');
  for (const line of (release.SHA256 ?? '').split('\n')) {
    const match = /^([a-f0-9]{64})\s+(\d+)\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const path = match[3]!;
    const identity = /^(.+)\/binary-([^/]+)\/Packages(?:\.(gz|xz))?$/.exec(path);
    if (!identity) continue;
    const key = path.replace(/\.(gz|xz)$/, '');
    const previous = indexes.get(key);
    // 同一内容只选一种压缩；gz无需额外运行库，其次xz，最后纯文本。
    const rank = (value: string) => (value.endsWith('.gz') ? 3 : value.endsWith('.xz') ? 2 : 1);
    if (!previous || rank(path) > rank(previous.path))
      indexes.set(key, {
        path,
        size: Number(match[2]),
        sha256: match[1]!,
        release: release.Suite ?? release.Codename!,
        component: identity[1]!,
        architecture: identity[2]!,
      });
  }
  if (!indexes.size) throw new SyntaxError('Release未声明可解析的二进制Packages索引');
  return [...indexes.values()];
}

export { normalizePythonName } from './policy.js';
export async function parseAnchors(
  stream: ReadableStream<Uint8Array>,
  accept: (attrs: Record<string, string>, text: string) => void,
): Promise<void> {
  let complete = false;
  let current: Record<string, string> | undefined;
  let text = '';
  let invalid: Error | undefined;
  const parser = new Parser(
    {
      onopentag: (name, attrs) => {
        if (name === 'a') {
          current = attrs;
          text = '';
        }
      },
      ontext: (value) => {
        if (current) text += value;
      },
      onclosetag: (name, implied) => {
        if (name === 'html' && !implied) complete = true;
        if (name === 'a' && current) {
          try {
            accept(current, text);
          } catch (error) {
            invalid = error as Error;
          }
          current = undefined;
        }
      },
    },
    { decodeEntities: true },
  );
  for await (const chunk of textChunks(stream)) {
    parser.write(chunk);
    if (invalid) throw invalid;
  }
  parser.end();
  if (invalid) throw invalid;
  if (!complete) throw new SyntaxError('包索引HTML未完整结束');
}

export function pythonFile(
  attrs: Record<string, string>,
  base: string,
  packageName: string,
): IndexedFile | undefined {
  if (!attrs.href) return undefined;
  const url = sourceUrl(new URL(attrs.href, base).href, 'https://mirrors.pku.edu.cn/pypi/web/');
  if (!url.pathname.startsWith('/pypi/web/packages/'))
    throw new SyntaxError('Python文件链接不在本站包目录');
  const filename = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
  const wheel = /^(.+?)-([^-]+)(?:-[^-]+)?-([^-]+)-([^-]+)-([^-]+)\.whl$/.exec(filename);
  const sdist = /^(.+)-([0-9][^-]*)\.(tar\.gz|zip)$/.exec(filename);
  if (!wheel && !sdist) return undefined;
  const tags = wheel ? { python: wheel[3], abi: wheel[4], platform: wheel[5] } : {};
  const platformTag = wheel?.[5] ?? '';
  const arch = /aarch64|arm64/.test(platformTag)
    ? 'arm64'
    : /x86_64|amd64/.test(platformTag)
      ? 'x64'
      : /i686|win32/.test(platformTag)
        ? 'x86'
        : 'unknown';
  const version = wheel?.[2] ?? sdist?.[2] ?? '';
  const hash = /^#sha256=([a-f0-9]{64})$/.exec(new URL(attrs.href, base).hash);
  return {
    packageName: normalizePythonName(packageName),
    version,
    filename,
    url: url.href,
    size: null,
    role: 'package',
    format: wheel ? 'whl' : sdist![3]!,
    arch,
    platform: /win/.test(platformTag)
      ? 'windows'
      : /macosx/.test(platformTag)
        ? 'macos'
        : /linux/.test(platformTag)
          ? 'linux'
          : 'any',
    ...(hash ? { checksum: { algorithm: 'sha256', value: hash[1]! } } : {}),
    compatibility: {
      ...tags,
      requiresPython: attrs['data-requires-python'] ?? '',
      yanked: attrs['data-yanked'] !== undefined,
      yankedReason: attrs['data-yanked'] ?? '',
    },
  };
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
});
export function rpmPrimaryLocation(body: string): { href: string; size?: number; sha256?: string } {
  const doc = xml.parse(body) as {
    repomd?: { data?: Record<string, unknown> | Record<string, unknown>[] };
  };
  const raw = doc.repomd?.data;
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const primary = entries.find((e) => e['@_type'] === 'primary');
  const location = primary?.location as { '@_href'?: string } | undefined;
  if (!location?.['@_href']) throw new SyntaxError('repomd未提供primary元数据');
  const checksum = primary?.checksum as { '@_type'?: string; '#text'?: string } | undefined;
  return {
    href: location['@_href'],
    ...(primary?.size ? { size: Number(primary.size) } : {}),
    ...(checksum?.['@_type'] === 'sha256' && checksum['#text']
      ? { sha256: checksum['#text'] }
      : {}),
  };
}
export async function rpmFiles(
  stream: ReadableStream<Uint8Array>,
  root: string,
  accept: (file: IndexedFile) => void,
) {
  let pending = '';
  let found = 0;
  let expectedCount: number | undefined;
  for await (const chunk of textChunks(stream)) {
    pending += chunk;
    if (expectedCount === undefined) {
      const declared = /<metadata\b[^>]*\bpackages=["'](\d+)["']/.exec(pending);
      if (declared) expectedCount = Number(declared[1]);
    }
    let end: number;
    while ((end = pending.indexOf('</package>')) >= 0) {
      const start = pending.indexOf('<package ');
      if (start < 0) throw new SyntaxError('primary包XML结构不符');
      const block = pending.slice(start, end + 10);
      pending = pending.slice(end + 10);
      const doc = xml.parse(block).package as Record<string, unknown>;
      const ver = doc.version as Record<string, string>;
      const location = doc.location as Record<string, string>;
      const size = doc.size as Record<string, string>;
      if (
        !doc.name ||
        !doc.arch ||
        !ver?.['@_ver'] ||
        !location?.['@_href'] ||
        !size?.['@_package']
      )
        throw new SyntaxError('RPM必需字段缺失');
      const url = sourceUrl(location['@_href'], root);
      const check = doc.checksum as Record<string, string>;
      accept({
        packageName: String(doc.name),
        version: `${ver['@_epoch'] && ver['@_epoch'] !== '0' ? `${ver['@_epoch']}:` : ''}${ver['@_ver']}-${ver['@_rel']}`,
        filename: decodeURIComponent(url.pathname.split('/').at(-1)!),
        url: url.href,
        size: Number(size['@_package']),
        role: 'package',
        platform: 'linux',
        arch: String(doc.arch),
        format: 'rpm',
        ...(check?.['@_type'] && check['#text']
          ? { checksum: { algorithm: check['@_type'], value: check['#text'] } }
          : {}),
      });
      found++;
    }
    if (pending.length > 4 * 1024 * 1024) throw new SyntaxError('primary单条记录过大或截断');
  }
  if (
    !found ||
    !pending.includes('</metadata>') ||
    (expectedCount !== undefined && found !== expectedCount)
  )
    throw new SyntaxError('primary索引未完整结束');
}

export async function pacmanFiles(
  stream: ReadableStream<Uint8Array>,
  root: string,
  accept: (file: IndexedFile) => void,
) {
  const tar = extract();
  let count = 0;
  const complete = new Promise<void>((resolve, reject) => {
    tar.on('error', reject);
    tar.on('finish', () => (count ? resolve() : reject(new SyntaxError('pacman索引为空'))));
    tar.on('entry', (header, entry, next) => {
      let text = '';
      entry.on('data', (chunk: unknown) => {
        if (header.name.endsWith('/desc')) {
          text += String(chunk);
          if (text.length > 1024 * 1024) tar.destroy(new Error('pacman描述过大'));
        }
      });
      entry.on('error', reject);
      entry.on('end', () => {
        try {
          if (header.name.endsWith('/desc')) {
            const values: Record<string, string> = {};
            for (const block of text.split('\n\n')) {
              const lines = block.trim().split('\n');
              const key = lines.shift()?.replace(/%/g, '');
              if (key) values[key] = lines.join('\n');
            }
            if (!values.NAME || !values.VERSION || !values.FILENAME || !values.ARCH)
              throw new SyntaxError('pacman字段缺失');
            const url = sourceUrl(values.FILENAME, root);
            accept({
              packageName: values.NAME,
              version: values.VERSION,
              filename: values.FILENAME,
              url: url.href,
              size: values.CSIZE ? Number(values.CSIZE) : null,
              role: 'package',
              platform: 'linux',
              arch: values.ARCH,
              format: values.FILENAME.split('.pkg.')[1]
                ? `pkg.${values.FILENAME.split('.pkg.')[1]}`
                : 'pkg',
              ...(values.SHA256SUM
                ? { checksum: { algorithm: 'sha256', value: values.SHA256SUM } }
                : {}),
              compatibility: { depends: values.DEPENDS ?? '' },
            });
            count++;
          }
          next();
        } catch (error) {
          tar.destroy(error as Error);
          reject(error);
        }
      });
      entry.resume();
    });
  });
  const input = Readable.from(chunks(stream));
  input.on('error', (error) => tar.destroy(error));
  input.pipe(tar);
  try {
    await complete;
  } finally {
    input.destroy();
    tar.destroy();
  }
}
