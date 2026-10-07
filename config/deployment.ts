import { siteConfig } from './site.ts';

export type BuildMode = 'preview' | 'release';

/** 普通构建与 PR 一律预览；正式发布必须由维护者显式选择，NODE_ENV 不代表发布授权。 */
export function readBuildMode(value: string | undefined = process.env.MIRRORN_BUILD_MODE): BuildMode {
  if (value === undefined || value === 'preview') return 'preview';
  if (value === 'release') return 'release';
  throw new Error('MIRRORN_BUILD_MODE 只接受 preview / release');
}

export function requireReleaseSite(siteUrl: string | null): string {
  if (!siteUrl) throw new Error('正式构建需要 config/site.ts 中的真实 siteUrl；未配置时使用 pnpm build 生成 noindex 预览。');
  const url = new URL(siteUrl);
  if (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
    throw new Error('正式站点必须使用真实 HTTPS 根地址，不使用本地预览地址。');
  }
  return siteUrl;
}

export const buildMode = readBuildMode();
export const releaseSiteUrl = buildMode === 'release' ? requireReleaseSite(siteConfig.siteUrl) : null;
