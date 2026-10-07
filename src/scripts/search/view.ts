import { contentCategories } from '../../content/categories.ts';
import type { SearchRecord } from '../../content/search/model.ts';

export interface SearchView {
  readonly root: HTMLElement;
  readonly form: HTMLFormElement;
  readonly input: HTMLInputElement;
  readonly clear: HTMLButtonElement;
  readonly retry: HTMLButtonElement;
  readonly reload: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly results: HTMLOListElement;
}
function required<T extends Element>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`搜索界面缺少 ${selector}`);
  return element;
}
export function readSearchView(root: HTMLElement): SearchView {
  return Object.freeze({
    root,
    form: required<HTMLFormElement>(root, '[data-search-form]'),
    input: required<HTMLInputElement>(root, '[data-search-input]'),
    clear: required<HTMLButtonElement>(root, '[data-search-clear]'),
    retry: required<HTMLButtonElement>(root, '[data-search-retry]'),
    reload: required<HTMLButtonElement>(root, '[data-search-reload]'),
    status: required<HTMLElement>(root, '[data-search-status]'),
    results: required<HTMLOListElement>(root, '[data-search-results]'),
  });
}

/** 网络字段和用户查询永远只作为文本/受控 ID，不插入 HTML。 */
function createResult(record: SearchRecord): HTMLLIElement {
  const option = document.createElement('li');
  option.id = `search-result-${record.id}`;
  option.className = 'search-result';
  option.setAttribute('role', 'option');
  option.setAttribute('aria-selected', 'false');
  const link = document.createElement('a');
  link.href = `/resources/${encodeURIComponent(record.id)}/`;
  link.tabIndex = -1; // 键盘由输入框的 combobox/active-descendant 管理，鼠标仍是原生链接。
  const name = document.createElement('strong');
  name.textContent = record.name;
  const category = document.createElement('span');
  category.className = 'search-result__category';
  category.textContent = contentCategories.find(({ id }) => id === record.category)!.name;
  const summary = document.createElement('p');
  summary.textContent = record.summary;
  link.append(name, category, summary);
  option.append(link);
  return option;
}

export function showResults(view: SearchView, records: readonly SearchRecord[]): void {
  view.results.replaceChildren(...records.map(createResult));
  view.results.hidden = records.length === 0;
  view.input.setAttribute('aria-expanded', String(records.length > 0));
  view.input.removeAttribute('aria-activedescendant');
}

export function closeResults(view: SearchView): void {
  view.results.hidden = true;
  view.input.setAttribute('aria-expanded', 'false');
  view.input.removeAttribute('aria-activedescendant');
}

export function selectResult(view: SearchView, index: number): void {
  const options = [...view.results.children];
  options.forEach((option, position) => option.setAttribute('aria-selected', String(position === index)));
  const option = options[index];
  if (!option) { view.input.removeAttribute('aria-activedescendant'); return; }
  view.input.setAttribute('aria-activedescendant', option.id);
  // 只在选项真的超出视口时滚动，不让第一次方向键把搜索框顶到屏幕外。
  const rect = option.getBoundingClientRect();
  const header = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--site-header-offset')) || 0;
  if (rect.top < header || rect.bottom > window.innerHeight) option.scrollIntoView({ block: 'nearest' });
}
