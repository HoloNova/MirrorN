import type { SiteConfig } from '../../config/site';
import type { ContentCategoryId } from './categories';

/** 目录锚点和文章返回链接共用同一命名，不各页面拼不同 ID。 */
export function categoryAnchor(category: ContentCategoryId): string {
  return `category-${category}`;
}
export function categoryHref(category: ContentCategoryId): string {
  return `/resources/#${categoryAnchor(category)}`;
}

/** P4 只支持已确认的 GitHub 编辑器，不为其他托管平台伪造编辑路径。 */
export function resourceEditUrl(config: SiteConfig, resourceId: string): string | null {
  if (!config.repositoryUrl || !config.defaultBranch) return null;
  const repository = new URL(config.repositoryUrl);
  const segments = repository.pathname.split('/').filter(Boolean);
  if (repository.hostname !== 'github.com' || segments.length !== 2) return null;
  const [owner, rawName] = segments;
  const name = rawName!.replace(/\.git$/, '');
  if (!/^[a-z\d-]+$/i.test(owner!) || !/^[a-z\d._-]+$/i.test(name)) return null;
  const branch = encodeURIComponent(config.defaultBranch);
  return `https://github.com/${owner}/${name}/edit/${branch}/content/resources/${encodeURIComponent(resourceId)}/index.md`;
}
