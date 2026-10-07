import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { ContentError, fail, issuesFrom, type ContentIssue } from '../diagnostics.ts';
import { activeFileExtensions, contentLimits, imageExtensions } from '../limits.ts';
import { readSafeFile } from '../parse/files.ts';
import type { ResourceInput } from '../registry/input.ts';
import { documentTarget } from './document-urls.ts';
import type { AssetRequest, ValidatedAssetFile } from './file-types.ts';
import { jsonIssue, sourceIndex } from './source-data.ts';

const imageMimeTypes: Readonly<Record<string, string>> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
};

function imageMediaType(bytes: Buffer): string | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brands = bytes.toString('ascii', 8, Math.min(bytes.length, bytes.readUInt32BE(0), 64));
    if (brands.includes('avif') || brands.includes('avis')) return 'image/avif';
  }
  return undefined;
}

function metadataRequests(input: ResourceInput): readonly AssetRequest[] {
  const images = [
    ...(input.metadata.icon?.startsWith('assets/') ? [{ path: input.metadata.icon, field: ['icon'] }] : []),
    ...(input.metadata.seo?.image ? [{ path: input.metadata.seo.image, field: ['seo', 'image'] }] : []),
  ];
  return images.flatMap((image) => {
    const location = input.metadataData.locate(image.field);
    if (/^https?:\/\//i.test(image.path)) return [];
    const target = documentTarget(image.path.split('/').map(encodeURIComponent).join('/'), input.metadata.id, location);
    return target.kind === 'asset' ? [{ path: target.path, kind: 'image' as const, location, referenced: true }] : [];
  });
}

function declaredRequests(input: ResourceInput): readonly AssetRequest[] {
  const referencedIds = new Set(input.data.sources.flatMap((source) => source.type === 'local' && source.assetId ? [source.assetId] : []));
  return input.data.assets.map((asset, index) => ({
    path: asset.path, kind: 'download', location: input.sourceData.locate(['assets', index, 'path']), referenced: referencedIds.has(asset.id),
  }));
}

function checkDownloadNames(input: ResourceInput): readonly ContentIssue[] {
  return input.data.assets.flatMap((asset, index) => activeFileExtensions.includes(extname(asset.downloadName).toLowerCase() as (typeof activeFileExtensions)[number])
    ? [jsonIssue(input, ['assets', index, 'downloadName'], 'E_ASSET', '下载名不能使用 HTML / JS / SVG / CSS 等主动内容扩展名')] : []);
}

async function inspectFile(input: ResourceInput, requests: readonly AssetRequest[]): Promise<ValidatedAssetFile> {
  const request = requests[0];
  if (!request) throw new Error('附件校验需要路径请求');
  const extension = extname(request.path).toLowerCase();
  if (activeFileExtensions.includes(extension as (typeof activeFileExtensions)[number])) fail(request.location, 'E_ASSET', '不接收同源 HTML / JS / SVG / CSS 主动内容');
  const image = requests.some((entry) => entry.kind === 'image');
  if (image && !imageExtensions.includes(extension as (typeof imageExtensions)[number])) fail(request.location, 'E_ASSET', '本地图片仅接受 PNG / JPEG / WebP / AVIF');
  const bytes = await readSafeFile(input.directory.absolutePath, request.path, contentLimits.assetBytes, request.location);
  const mediaType = imageMediaType(bytes);
  if ((image || Object.hasOwn(imageMimeTypes, extension)) && mediaType !== imageMimeTypes[extension]) {
    fail(request.location, 'E_ASSET', '图片实际文件头与扩展格式不匹配（这里只识别格式，不声称完成图片解码）');
  }
  for (const asset of input.data.assets.filter((entry) => entry.path === request.path)) {
    if (mediaType && asset.mediaType && asset.mediaType.toLowerCase() !== mediaType && asset.mediaType.toLowerCase() !== 'application/octet-stream') {
      fail(request.location, 'E_ASSET', '附件 mediaType 与实际图片格式不匹配');
    }
  }
  return {
    path: request.path, byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sha512: createHash('sha512').update(bytes).digest('hex'),
    mediaType: mediaType ?? 'application/octet-stream', kind: mediaType ? 'image' : 'download',
    referenced: requests.some((entry) => entry.referenced),
  };
}

function localArtifactIssues(input: ResourceInput, files: readonly ValidatedAssetFile[]): readonly ContentIssue[] {
  const index = sourceIndex(input.data);
  const fileIndex = new Map(files.map((file) => [file.path, file]));
  return input.data.sources.flatMap((source) => {
    if (source.type !== 'local' || !source.assetId || !source.artifactId) return [];
    const asset = index.assets.get(source.assetId);
    const artifact = index.artifacts.get(source.artifactId);
    const file = asset ? fileIndex.get(asset.path) : undefined;
    if (!file || !artifact) return [];
    const artifactNumber = input.data.artifacts.findIndex((entry) => entry.id === artifact.id);
    return [
      ...(artifact.fileSize !== undefined && artifact.fileSize !== file.byteLength
        ? [jsonIssue(input, ['artifacts', artifactNumber, 'fileSize'], 'E_ASSET', `本地文件实际为 ${file.byteLength} 字节，与 fileSize 不符`)] : []),
      ...(artifact.checksum && artifact.checksum.value.toLowerCase() !== file[artifact.checksum.algorithm]
        ? [jsonIssue(input, ['artifacts', artifactNumber, 'checksum', 'value'], 'E_ASSET', `本地文件 ${artifact.checksum.algorithm.toUpperCase()} 不符`)] : []),
    ];
  });
}

export async function validateAssets(input: ResourceInput, documentRequests: readonly AssetRequest[]): Promise<readonly ValidatedAssetFile[]> {
  const nameIssues = checkDownloadNames(input);
  if (nameIssues.length) throw new ContentError(nameIssues);
  const requests = [...declaredRequests(input), ...metadataRequests(input), ...documentRequests];
  const paths = [...new Set(requests.map((request) => request.path))];
  let files: readonly ValidatedAssetFile[] = [];
  let issues: readonly ContentIssue[] = [];
  let totalBytes = 0;
  for (const path of paths) {
    const fileRequests = requests.filter((request) => request.path === path);
    const request = fileRequests[0];
    if (!request) continue;
    try {
      const file = await inspectFile(input, fileRequests);
      totalBytes += file.byteLength;
      if (totalBytes > contentLimits.resourceAssetBytes) fail(request.location, 'E_BUDGET', '单资源本地附件合计超过 20 MiB');
      files = [...files, file];
    } catch (error) {
      issues = [...issues, ...issuesFrom(error, request.location)];
      if (totalBytes > contentLimits.resourceAssetBytes) break;
    }
  }
  const allIssues = [...issues, ...localArtifactIssues(input, files)];
  if (allIssues.length) throw new ContentError(allIssues);
  return files;
}
