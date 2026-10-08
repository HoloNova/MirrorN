import { siteConfig } from '../../config/site.ts';
import { releaseSiteUrl } from '../../config/deployment.ts';
import { contentCategories, type ContentCategoryId } from './categories.ts';
import type { PublishedResource } from './registry/types.ts';
import { categoryHref, resourceEditUrl } from './navigation.ts';
import { loadResourceRegistry } from './registry/load.ts';
import { highlightResource } from './render/highlight.server.ts';
import { resolveDocumentUrl } from './resolve/assets.ts';
import { createSearchSnapshot } from './search/snapshot.ts';

/** .server 模块只在内容校验、开发和预渲染中读取文件，不进入浏览器包。 */
export async function siteRegistry() {
  return loadResourceRegistry(process.cwd(), { siteUrl: siteConfig.siteUrl });
}
export async function loadSiteData(request: Request) {
  const registry = await siteRegistry();
  const path = new URL(request.url).pathname.replace(/(?:\/_)?\.data$/u, '').replace(/\/+$/u, '') || '/';
  const match = /^\/resources\/([a-z0-9-]+)$/u.exec(path);
  const resource = match ? registry.get(match[1]!) : undefined;
  const known = path === '/' || path === '/resources' || path === '/about' || Boolean(resource);
  const title = resource ? resource.metadata.seo?.title ?? resource.metadata.name : path === '/' ? undefined : path === '/resources' ? '已收录' : path === '/about' ? '关于本站' : '页面不存在';
  const description = resource ? resource.metadata.seo?.description ?? resource.metadata.summary : path === '/' ? 'MirrorN 整理开发常用资源与学习文档，提供下载直链、镜像入口和安装说明。' : path === '/resources' ? '按八个固定分类浏览 MirrorN 收录的资源。' : path === '/about' ? 'MirrorN 的定位、资源获取方式、内容与组件贡献及许可说明。' : undefined;
  const canonical = releaseSiteUrl && known ? new URL(path === '/' ? '/' : `${path}/`, releaseSiteUrl).href : null;
  const image = canonical && resource?.metadata.seo?.image ? new URL(resolveDocumentUrl(resource, resource.metadata.seo.image), canonical).href : null;
  const snapshot = createSearchSnapshot(registry);
  return {
    pathname: path,
    seo: { title: title ? `${title} · ${siteConfig.siteName}` : siteConfig.siteName, description, canonical, image, pageType: resource ? 'article' : 'website' },
    search: { indexUrl: snapshot.url, count: snapshot.count },
    contributionId: registry.get('mirrorn-contributing')?.metadata.id ?? null,
  };
}
/** 卡片图片：icon 为 assets 图片时给摘要地址；为分类 ID 或省略时用对应分类线稿，保证每张卡片右侧都有图位。 */
function cardImage(resource: PublishedResource): { readonly src: string } | { readonly category: ContentCategoryId } {
  const { icon, category } = resource.metadata;
  if (icon?.startsWith('assets/')) return { src: resolveDocumentUrl(resource, icon) };
  return { category: (icon ?? category) as ContentCategoryId };
}
export async function loadDirectoryData() {
  const registry = await siteRegistry();
  const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  return contentCategories.map((category) => ({ ...category, resources: registry.resources.filter((resource) => resource.metadata.category === category.id).toSorted((left, right) => collator.compare(left.metadata.sortKey ?? left.metadata.name, right.metadata.sortKey ?? right.metadata.name) || collator.compare(left.metadata.id, right.metadata.id)).map((resource) => ({ id: resource.metadata.id, name: resource.metadata.name, summary: resource.metadata.summary, image: cardImage(resource) })) }));
}
export async function loadResourceData(id: string) {
  const registry = await siteRegistry();
  const resource = registry.get(id);
  if (!resource) throw new Response('Not found', { status: 404 });
  const category = contentCategories.find((entry) => entry.id === resource.metadata.category)!;
  const references = resource.resourceReferences.map((reference) => { const target = registry.get(reference); if (!target) throw new Error(`资源引用未公开：${reference}`); return { id: target.metadata.id, name: target.metadata.name }; });
  return { resource, references, highlights: await highlightResource(resource), categoryName: category.name, returnHref: categoryHref(category.id), editUrl: resourceEditUrl(siteConfig, resource.metadata.id), contributionId: registry.get('mirrorn-contributing')?.metadata.id ?? null };
}
