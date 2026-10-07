import { fileURLToPath } from 'node:url';
import { root } from 'astro:config/server';
import type { APIRoute, GetStaticPaths } from 'astro';
import { siteConfig } from '../../../../../config/site.ts';
import { loadResourceRegistry } from '../../../../content/registry/load.ts';
import { assetFileName, assetUrl } from '../../../../content/resolve/assets.ts';
import { readPublishedAsset } from '../../../../content/render/assets.ts';
import type { ValidatedAssetFile } from '../../../../content/validate/file-types.ts';

interface Props { readonly resourceId: string; readonly file: ValidatedAssetFile }

/** 同时服务 dev 和静态生成；只允许 Registry 中公开且引用的文件，不接收磁盘路径参数。 */
export const getStaticPaths = (async () => {
  const registry = await loadResourceRegistry(fileURLToPath(root), { siteUrl: siteConfig.siteUrl });
  const paths = registry.resources.flatMap((resource) => resource.files.map((file) => ({
    params: { id: resource.metadata.id, hash: file.sha256, file: assetFileName(file) },
    props: { resourceId: resource.metadata.id, file } satisfies Props,
    key: assetUrl(resource, file),
  })));
  return [...new Map(paths.map(({ key, ...path }) => [key, path])).values()];
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { resourceId, file } = props as Props;
  const bytes = await readPublishedAsset(fileURLToPath(root), resourceId, file);
  return new Response(bytes, { headers: {
    'Content-Type': file.mediaType,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': file.kind === 'image' ? 'inline' : 'attachment',
    'Cache-Control': 'public, max-age=31536000, immutable',
  } });
};
