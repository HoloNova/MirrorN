import type { Mirror } from '@mirrorn/shared';

/**
 * 镜像站性质的展示词（官方 / 高校 / 商业 / 社区）。
 *
 * 只此一份：生态文档的来源列表与站点页的标签都引用这里，避免两处各写一套映射后慢慢漂移。
 * 与 `styles/readout.css` 的 `.kind` 配套使用（像印章一样的小方框，不用胶囊）。
 */
export const MIRROR_KIND_LABELS: Record<Mirror['kind'], string> = {
  official: '官方',
  university: '高校',
  commercial: '商业',
  community: '社区',
};
