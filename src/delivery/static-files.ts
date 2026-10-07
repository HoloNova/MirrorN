import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildMode, releaseSiteUrl } from '../../config/deployment.ts';
import { licenseFiles } from '../../config/licensing.ts';
import type { ResourceRegistry } from '../content/registry/types.ts';
import { readPublishedAsset } from '../content/render/assets.ts';
import { assetUrl } from '../content/resolve/assets.ts';
import { createSearchSnapshot } from '../content/search/snapshot.ts';

export function robotsText(): string {
  return buildMode === 'release' ? `User-agent: *\nAllow: /\nSitemap: ${releaseSiteUrl}/sitemap-index.xml\n` : 'User-agent: *\nDisallow: /\n';
}

/** 输出路径由公开 Registry 和固定许可映射产生，不接受 URL 中的磁盘路径。 */
export function publicStaticPaths(registry: ResourceRegistry): readonly string[] {
  return [
    createSearchSnapshot(registry).url, '/robots.txt',
    ...licenseFiles.map((entry) => `/licenses/${entry.name}.txt`),
    ...registry.resources.flatMap((resource) => resource.files.map((file) => assetUrl(resource, file))),
  ];
}

export async function readPublicStaticFile(root: string, registry: ResourceRegistry, path: string) {
  if (path === '/robots.txt') return { bytes: Buffer.from(robotsText()), type: 'text/plain; charset=utf-8' };
  const snapshot = createSearchSnapshot(registry);
  if (path === snapshot.url) return { bytes: Buffer.from(snapshot.text), type: 'application/json; charset=utf-8' };
  const license = licenseFiles.find((entry) => path === `/licenses/${entry.name}.txt`);
  if (license) return { bytes: await readFile(join(root, license.path)), type: 'text/plain; charset=utf-8' };
  for (const resource of registry.resources) {
    const file = resource.files.find((entry) => assetUrl(resource, entry) === path);
    if (file) return { bytes: await readPublishedAsset(root, resource.metadata.id, file), type: file.mediaType };
  }
  return undefined;
}
