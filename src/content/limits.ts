/** 仓库维护预算，不是网络探测或上传服务的限流配置。 */
export const contentLimits = Object.freeze({
  textBytes: 1024 * 1024,
  assetBytes: 5 * 1024 * 1024,
  resourceAssetBytes: 20 * 1024 * 1024,
  dataDepth: 32,
  markdownDepth: 32,
  markdownNodes: 50_000,
  readChunkBytes: 64 * 1024,
});

export const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.avif'] as const;
export const activeFileExtensions = [
  '.html', '.htm', '.xhtml', '.shtml', '.svg', '.svgz',
  '.js', '.mjs', '.cjs', '.jsx', '.tsx', '.css',
] as const;
