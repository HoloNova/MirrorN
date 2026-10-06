/**
 * 主导航的三个模块。
 *
 * 只此一份：左侧导航（app 形态）与生态文档页顶栏里的横向导航共用，
 * 避免两处各写一份后慢慢漂移（例如将来加"统计"时只改了一处）。
 */
export interface NavItem {
  name: 'home' | 'ecosystems' | 'help' | 'admin';
  label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { name: 'home', label: '首页' },
  { name: 'ecosystems', label: '生态' },
  { name: 'help', label: '帮助' },
  { name: 'admin', label: '内容管理' },
];
