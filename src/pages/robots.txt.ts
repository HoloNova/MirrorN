import type { APIRoute } from 'astro';
import { releaseSiteUrl } from '../../config/deployment.ts';

/** 未配域名或 PR 预览一律不索引；只在显式正式构建中声明站点地图。 */
export const GET: APIRoute = () => new Response(releaseSiteUrl
  ? `User-agent: *\nAllow: /\nSitemap: ${releaseSiteUrl}/sitemap-index.xml\n`
  : 'User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
