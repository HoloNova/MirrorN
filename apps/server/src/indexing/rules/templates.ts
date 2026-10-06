import type { DownloadBinding } from '@mirrorn/shared';
import { sourceUrl, resourceSite } from '../policy.js';

export function bindingDirectory(binding: DownloadBinding, directory: string) {
  const root = `${resourceSite(binding.siteId).origin}/${binding.rootPath}`;
  const url = sourceUrl(directory, root);
  if (!url.pathname.endsWith('/') || url.search) throw new Error('规则目录范围无效');
  return { url, relative: decodeURIComponent(url.pathname.slice(new URL(root).pathname.length)) };
}
export function isFileLeaf(binding: DownloadBinding, directory: string) {
  return new RegExp(binding.leaf).test(bindingDirectory(binding, directory).relative);
}
export function directoryDecision(
  binding: DownloadBinding,
  directory: string,
  depth: number,
  name: string,
): 'descend' | 'rejected' | 'pending' {
  const { relative } = bindingDirectory(binding, directory);
  const segments = relative.split('/').filter(Boolean);
  if (segments.length !== depth) throw new Error('任务深度与实际目录不一致');
  if (binding.ignoreDirectories.some((pattern) => new RegExp(pattern).test(name)))
    return 'rejected';
  const pattern = binding.steps[depth];
  if (pattern && new RegExp(pattern).test(name)) return 'descend';
  return 'pending';
}
