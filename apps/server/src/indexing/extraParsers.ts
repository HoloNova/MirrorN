import Toml from '@iarna/toml';
import tar from 'tar-stream';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import type { IndexedFile } from './policy.js';
import { sourceUrl } from './policy.js';
import { chunks, textChunks } from './source.js';
import { controlRecords } from './parsers.js';

type Accept = (file: IndexedFile) => void;
async function walkTar(
  stream: ReadableStream<Uint8Array>,
  receive: (name: string, text: string) => void,
) {
  const extract = tar.extract();
  const complete = new Promise<void>((resolve, reject) => {
    extract.on('finish', resolve);
    extract.on('error', reject);
  });
  void complete.catch(() => {});
  extract.on('entry', (header, entry, next) => {
    const wanted = /(?:Package|Versions)\.toml$/.test(header.name);
    let text = '';
    let size = 0;
    const decoder = new StringDecoder('utf8');
    entry.on('data', (chunk) => {
      if (wanted) {
        const bytes = chunk instanceof Uint8Array ? Buffer.from(chunk) : Buffer.from(String(chunk));
        size += bytes.byteLength;
        if (size > 16 * 1024 * 1024) {
          extract.destroy(new Error('单项目TOML超过限额，未发布'));
          return;
        }
        text += decoder.write(bytes);
      }
    });
    entry.on('end', () => {
      try {
        if (wanted) receive(header.name, text + decoder.end());
        next(null);
      } catch (error) {
        extract.destroy(error as Error);
      }
    });
    entry.on('error', (error) => extract.destroy(error));
    entry.resume();
  });
  try {
    for await (const chunk of chunks(stream)) {
      if (!extract.write(chunk)) await once(extract, 'drain');
    }
    extract.end(Buffer.alloc(0));
    await complete;
  } catch (error) {
    extract.destroy(error as Error);
    throw error;
  }
}
export async function juliaRegistryFiles(
  stream: ReadableStream<Uint8Array>,
  baseUrl: string,
  accept: Accept,
) {
  type Project = { identity?: { name: string; uuid: string }; versions?: Record<string, unknown> };
  const pending = new Map<string, Project>();
  let count = 0;
  await walkTar(stream, (path, text) => {
    const parent = path.slice(0, path.lastIndexOf('/'));
    const item = pending.get(parent) ?? {};
    const parsed = Toml.parse(text) as Record<string, unknown>;
    if (path.endsWith('/Package.toml')) {
      if (
        typeof parsed.name !== 'string' ||
        typeof parsed.uuid !== 'string' ||
        !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(parsed.uuid)
      )
        throw new SyntaxError('Julia项目身份缺失');
      item.identity = { name: parsed.name, uuid: parsed.uuid };
    } else item.versions = parsed;
    if (item.identity && item.versions) {
      for (const [version, raw] of Object.entries(item.versions)) {
        if (!raw || typeof raw !== 'object') throw new SyntaxError('Julia版本字段无效');
        const metadata = raw as Record<string, unknown>;
        const hash = metadata['git-tree-sha1'];
        if (typeof hash !== 'string' || !/^[\da-f]{40}$/i.test(hash))
          throw new SyntaxError('Julia包树身份无效');
        accept({
          packageName: item.identity.name,
          version,
          filename: hash,
          url: sourceUrl(`package/${item.identity.uuid}/${hash}`, baseUrl).href,
          size: null,
          role: 'package',
          platform: 'any',
          arch: 'any',
          format: 'tar.gz',
          compatibility: {
            uuid: item.identity.uuid,
            gitTreeSha1: hash,
            yanked: metadata.yanked === true,
            suggestedFilename: `${item.identity.name}-${version}.tar.gz`,
          },
        });
        count++;
      }
      pending.delete(parent);
    } else pending.set(parent, item);
  });
  if (!count || [...pending.values()].some((item) => item.versions))
    throw new SyntaxError('Julia注册表未完整匹配项目及版本');
}
export async function texliveFiles(
  stream: ReadableStream<Uint8Array>,
  baseUrl: string,
  accept: Accept,
) {
  let pending = '';
  let total = 0;
  const consume = (record: string) => {
    const value: Record<string, string> = {};
    for (const line of record.split('\n')) {
      const position = line.indexOf(' ');
      if (position > 0 && !line.startsWith(' '))
        value[line.slice(0, position)] = line.slice(position + 1);
    }
    if (!value.containersize || !value.containerchecksum) return;
    if (!value.name || !value.revision || !/^[\da-f]{128}$/i.test(value.containerchecksum))
      throw new SyntaxError('TeX Live包记录无效');
    const filename = `${value.name}.tar.xz`;
    accept({
      packageName: value.name,
      version: value.revision,
      filename,
      url: sourceUrl(`archive/${encodeURIComponent(filename)}`, baseUrl).href,
      size: Number(value.containersize),
      role: 'package',
      platform: 'any',
      arch: 'any',
      format: 'tar.xz',
      checksum: { algorithm: 'sha512', value: value.containerchecksum },
      compatibility: { category: value.category },
    });
    total++;
  };
  for await (const chunk of textChunks(stream)) {
    pending += chunk.replace(/\r/g, '');
    let end: number;
    while ((end = pending.indexOf('\n\n')) >= 0) {
      consume(pending.slice(0, end));
      pending = pending.slice(end + 2);
    }
    if (pending.length > 8 * 1024 * 1024) throw new Error('单条TeX Live记录超过限额');
  }
  if (pending.trim()) consume(pending);
  if (!total) throw new SyntaxError('TeX Live索引没有可用包记录');
}
export function firmwareFiles(payload: unknown, baseUrl: string, accept: Accept) {
  if (!payload || typeof payload !== 'object') throw new SyntaxError('设备镜像索引无效');
  const root = payload as Record<string, unknown>;
  if (
    !root.profiles ||
    typeof root.profiles !== 'object' ||
    typeof root.version_number !== 'string'
  )
    throw new SyntaxError('设备镜像索引字段缺失');
  for (const [device, raw] of Object.entries(root.profiles)) {
    if (!raw || typeof raw !== 'object' || !Array.isArray((raw as Record<string, unknown>).images))
      throw new SyntaxError('设备镜像列表缺失');
    for (const item of (raw as { images: unknown[] }).images) {
      if (!item || typeof item !== 'object') throw new SyntaxError('镜像记录无效');
      const image = item as Record<string, unknown>;
      if (
        typeof image.name !== 'string' ||
        typeof image.sha256 !== 'string' ||
        !/^[\da-f]{64}$/i.test(image.sha256)
      )
        throw new SyntaxError('镜像身份/校验值无效');
      accept({
        packageName: device,
        version: root.version_number,
        filename: image.name,
        url: sourceUrl(image.name, baseUrl).href,
        size: typeof image.size === 'number' ? image.size : null,
        role: 'firmware',
        platform: 'linux',
        arch: typeof root.arch_packages === 'string' ? root.arch_packages : 'unknown',
        format: /\.((?:img|tar)\.(?:gz|xz)|[^.]+)$/.exec(image.name)?.[1] ?? 'bin',
        checksum: { algorithm: 'sha256', value: image.sha256 },
        compatibility: {
          device,
          imageType: image.type,
          filesystem: image.filesystem,
          target: root.target,
        },
      });
    }
  }
}
export async function apkFiles(
  stream: ReadableStream<Uint8Array>,
  baseUrl: string,
  accept: Accept,
) {
  const extract = tar.extract();
  let count = 0;
  const done = new Promise<void>((resolve, reject) => {
    extract.on('finish', resolve);
    extract.on('error', reject);
  });
  void done.catch(() => {});
  extract.on('entry', (_header, entry, next) => {
    if (_header.name !== 'APKINDEX') {
      entry.resume();
      entry.on('end', next);
      return;
    }
    void (async () => {
      for await (const row of controlRecords(
        Readable.toWeb(
          Readable.from(entry as unknown as AsyncIterable<Uint8Array>),
        ) as ReadableStream<Uint8Array>,
      )) {
        if (!row.P || !row.V || !row.A) throw new SyntaxError('APK索引缺少包身份');
        const filename = `${row.P}-${row.V}.apk`;
        accept({
          packageName: row.P,
          version: row.V,
          filename,
          url: sourceUrl(filename, baseUrl).href,
          size: row.S ? Number(row.S) : null,
          role: 'package',
          platform: 'linux',
          arch: row.A,
          format: 'apk',
          compatibility: { depends: row.D ?? '' },
        });
        count++;
      }
      next(null);
    })().catch((error) => extract.destroy(error));
  });
  try {
    for await (const chunk of chunks(stream)) {
      if (!extract.write(chunk)) await once(extract, 'drain');
    }
    extract.end(Buffer.alloc(0));
    await done;
  } catch (error) {
    extract.destroy(error as Error);
    throw error;
  }
  if (!count) throw new SyntaxError('APK索引为空');
}
