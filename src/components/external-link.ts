import { siteConfig } from '../../config/site.ts';

/**
 * 站外链接在新标签页打开；站内路径、锚点和本站附件仍在当前标签页打开。
 *
 * 为什么存在：资源正文、来源入口、编辑入口和仓库入口都指向其他站点。若在本站标签页直接跳转，
 * 读者会离开正在阅读的资源，返回时还要重新找位置。判断标准与内容校验一致：只有 http(s) 绝对地址，
 * 且不属于正式站点地址才是站外链接；未配置 siteUrl 时，所有 http(s) 地址都视为站外。
 */
const siteOrigin = siteConfig.siteUrl === null ? null : new URL(siteConfig.siteUrl).origin;

export function externalLinkProps(href: string | null | undefined): { target?: '_blank'; rel?: string } {
  if (!href || !/^https?:\/\//iu.test(href)) return {};
  if (siteOrigin !== null && new URL(href).origin === siteOrigin) return {};
  return { target: '_blank', rel: 'noopener' };
}
