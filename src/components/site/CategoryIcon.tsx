import type { ContentCategoryId } from '../../content/categories.ts';

/**
 * 八个分类的线稿图标，全站唯一来源（DESIGN 第 5 节：统一一种轻量 SVG 图标来源）。
 * 与站内其他图标同为 24 网格、1.7 线宽、currentColor，颜色跟随所在文字。
 * Front Matter 的 icon 填分类 ID 时也走这里，作者不能注入任意 SVG。
 */
const paths: Readonly<Record<ContentCategoryId, string>> = {
  software: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM3 9h18M6.5 6.5h.01M9.5 6.5h.01',
  runtime: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 6 3 2.5L7 15m5.5 0H17',
  package: 'M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5 12 12l8-4.5M12 12v9',
  dataset: 'M4.5 5.5C4.5 4.1 7.9 3 12 3s7.5 1.1 7.5 2.5S16.1 8 12 8 4.5 6.9 4.5 5.5Zm0 0v13C4.5 19.9 7.9 21 12 21s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5',
  model: 'M5 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.6 7.2l3.8 3.6m-3.8 6 3.8-3.6M14 12h3',
  system: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-6.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM16.5 7.5a6.4 6.4 0 0 1 1.8 3.3',
  container: 'M4 7h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm3.5 3v6m4.5-6v6m4.5-6v6M7 7V4.5h10V7',
  document: 'M3 5.5c3-1.3 6-1.3 9 .5 3-1.8 6-1.8 9-.5v13c-3-1.3-6-1.3-9 .5-3-1.8-6-1.8-9-.5v-13ZM12 6v13',
};

export default function CategoryIcon({ category, className }: { category: ContentCategoryId; className?: string }) {
  return <svg className={className} aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[category]} /></svg>;
}
