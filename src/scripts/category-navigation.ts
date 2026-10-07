/** 只匹配本页真实分类，不把 URL 片段当 CSS 选择器或任意元素 ID。 */
const categories = [...document.querySelectorAll<HTMLDetailsElement>('[data-category]')];
function revealCategory(): void {
  const category = categories.find((entry) => `#${entry.id}` === window.location.hash);
  if (!category) return;
  category.open = true;
  requestAnimationFrame(() => category.scrollIntoView({ block: 'start', behavior: 'instant' }));
}
revealCategory();
window.addEventListener('hashchange', revealCategory);
export {};
