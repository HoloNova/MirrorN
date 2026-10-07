import type { PublishedResource } from '../registry/types.ts';
import type { ValidatedAssetFile } from '../validate/file-types.ts';

const imageExtensions: Readonly<Record<string, string>> = {
  'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/avif': 'avif',
};
export const assetUrlPrefix = '/resource-assets/';

/** 下载文件固定 .bin，不能因原始扩展名而被静态主机当成同源脚本。原始名称由 download 属性提供。 */
export function assetFileName(file: ValidatedAssetFile): string {
  if (file.kind === 'download') return 'file.bin';
  const extension = imageExtensions[file.mediaType];
  if (!extension) throw new Error(`未登记的图片格式 ${file.mediaType}`);
  return `image.${extension}`;
}

export function assetUrl(resource: PublishedResource, file: ValidatedAssetFile): string {
  return `${assetUrlPrefix}${resource.metadata.id}/${file.sha256}/${assetFileName(file)}`;
}

export function resolveAsset(resource: PublishedResource, path: string): { readonly file: ValidatedAssetFile; readonly href: string } {
  const file = resource.files.find((entry) => entry.path === path);
  if (!file) throw new Error(`${resource.metadata.id} 未发布附件 ${path}`);
  return Object.freeze({ file, href: assetUrl(resource, file) });
}

/** Parser 已统一相对图片 URL；渲染阶段只将已登记的 assets 路径换成摘要地址。 */
export function resolveDocumentUrl(resource: PublishedResource, url: string): string {
  return url.startsWith('assets/') ? resolveAsset(resource, decodeURIComponent(url)).href : url;
}
