import type { SearchEngine } from '../../content/search/engine.ts';
import type { SearchRecord } from '../../content/search/model.ts';
import { searchLimits } from '../../content/search/limits.ts';
import { boundedQuery, normalizeQuery } from '../../content/search/query.ts';
import { loadSearchEngine } from './load.ts';
import { closeResults, readSearchView, selectResult, showResults, type SearchView } from './view.ts';

/** 可变状态只属于当前界面；资源数据与检索返回值保持只读。 */
class SearchController {
  private readonly view: SearchView;
  private readonly indexPath: string;
  private engine?: SearchEngine;
  private pending?: Promise<void>;
  private failed = false;
  private composing = false;
  private dismissed = false;
  private inputTimer?: number;
  private hits: readonly SearchRecord[] = [];
  private activeIndex = -1;

  constructor(root: HTMLElement) {
    this.view = readSearchView(root);
    this.indexPath = root.dataset.searchIndex ?? '';
    this.bindEvents();
    this.view.form.hidden = false;
    this.view.input.disabled = false;
    this.restoreQuery();
  }

  private bindEvents(): void {
    const { input, form, clear, retry, reload } = this.view;
    form.addEventListener('submit', (event) => event.preventDefault());
    input.addEventListener('focus', () => { this.dismissed = false; this.startLoad(); });
    input.addEventListener('input', () => this.scheduleInput());
    input.addEventListener('compositionstart', () => {
      this.composing = true;
      window.clearTimeout(this.inputTimer);
      this.inputTimer = undefined;
      this.hits = [];
      showResults(this.view, []);
      this.setStatus('输入完成后开始搜索。');
    });
    input.addEventListener('compositionend', () => { this.composing = false; this.scheduleInput(); });
    input.addEventListener('keydown', (event) => this.onKey(event));
    clear.addEventListener('click', () => this.clearQuery());
    retry.addEventListener('click', () => {
      this.failed = false;
      this.startLoad(true);
      input.focus({ preventScroll: true });
    });
    reload.addEventListener('click', () => { this.flushInput(); window.location.reload(); });
    window.addEventListener('popstate', () => this.restoreQuery());
    window.addEventListener('pageshow', (event) => { if (event.persisted) this.restoreQuery(); });
  }

  private setStatus(message: string): void {
    if (this.view.status.textContent !== message) this.view.status.textContent = message;
  }

  private persistQuery(): void {
    const url = new URL(window.location.href);
    const query = boundedQuery(this.view.input.value);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }

  private restoreQuery(): void {
    window.clearTimeout(this.inputTimer);
    this.inputTimer = undefined;
    this.composing = false;
    this.dismissed = false;
    this.view.input.value = boundedQuery(new URL(window.location.href).searchParams.get('q') ?? '');
    this.processInput();
  }

  private scheduleInput(): void {
    if (this.composing) return;
    this.dismissed = false;
    window.clearTimeout(this.inputTimer);
    this.hits = [];
    this.activeIndex = -1;
    showResults(this.view, []); // 不让旧查询的结果在等待期间仍能被误打开。
    this.view.clear.hidden = this.view.input.value.length === 0;
    if (!normalizeQuery(this.view.input.value)) { this.inputTimer = undefined; this.processInput(); return; }
    this.setStatus('正在检索…');
    this.inputTimer = window.setTimeout(() => { this.inputTimer = undefined; this.processInput(); }, searchLimits.inputDelayMs);
  }

  private processInput(): void {
    this.persistQuery();
    if (normalizeQuery(this.view.input.value)) this.startLoad();
    else this.render();
  }

  private startLoad(revalidate = false): void {
    if (this.engine || this.pending || this.failed) { this.render(); return; }
    this.pending = loadSearchEngine(this.indexPath, revalidate).then((engine) => {
      this.engine = engine;
    }).catch((error: unknown) => {
      this.failed = true;
      console.error('[MirrorN search] 无法加载公开索引或检索模块', error);
    }).finally(() => {
      this.pending = undefined;
      this.render(); // 读取最新输入，不把请求开始时的查询重新显示回来。
    });
    this.render();
  }

  private render(): void {
    const { input, clear, retry, reload } = this.view;
    const query = normalizeQuery(input.value);
    input.setAttribute('aria-busy', String(Boolean(this.pending)));
    if (this.composing) return;
    clear.hidden = input.value.length === 0;
    retry.hidden = !this.failed;
    reload.hidden = !this.failed;
    this.activeIndex = -1;
    this.hits = this.engine && query ? this.engine.search(query) : [];
    showResults(this.view, this.hits);
    if (this.dismissed) closeResults(this.view);
    if (this.failed) this.setStatus('搜索暂时不可用。请重试；模块仍不可用时刷新页面，或从已收录目录浏览资源。');
    else if (this.dismissed) this.setStatus('已收起结果，查询仍保留；再次输入或按方向键可继续搜索。');
    else if (this.pending && query) this.setStatus('正在加载搜索索引…');
    else if (!query) this.setStatus(this.view.root.dataset.searchCount === '0'
      ? '当前暂无公开资源，可以查看已收录目录。'
      : '输入资源名称、别名、简介、标签或显式拼音；↑↓ 选择，Enter 打开，Esc 收起结果。');
    else if (!this.hits.length) this.setStatus(`没有找到“${boundedQuery(input.value)}”。试试别名或标签，也可以浏览分类目录。`);
    else this.setStatus(`显示 ${this.hits.length} 个匹配结果（最多 ${searchLimits.resultCount} 个）。↑↓ 选择，Enter 打开。`);
  }

  private flushInput(): void {
    if (this.inputTimer === undefined) return;
    window.clearTimeout(this.inputTimer);
    this.inputTimer = undefined;
    this.processInput();
  }

  private onKey(event: KeyboardEvent): void {
    if (this.composing || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    this.flushInput();
    if (event.key === 'Escape') {
      this.dismissed = true;
      this.activeIndex = -1;
      selectResult(this.view, -1);
      closeResults(this.view);
      this.setStatus('已收起结果，查询仍保留；再次输入或按方向键可继续搜索。');
      return;
    }
    this.dismissed = false;
    if (!this.hits.length) { this.render(); return; }
    if (event.key === 'Enter') {
      const hit = this.hits[this.activeIndex < 0 ? 0 : this.activeIndex]!;
      window.location.assign(`/resources/${encodeURIComponent(hit.id)}/`);
      return;
    }
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    this.activeIndex = this.activeIndex < 0 ? (direction > 0 ? 0 : this.hits.length - 1)
      : (this.activeIndex + direction + this.hits.length) % this.hits.length;
    this.view.results.hidden = false;
    this.view.input.setAttribute('aria-expanded', 'true');
    selectResult(this.view, this.activeIndex);
  }

  private clearQuery(): void {
    window.clearTimeout(this.inputTimer);
    this.inputTimer = undefined;
    this.composing = false;
    this.view.input.value = '';
    this.dismissed = false;
    this.processInput();
    this.view.input.focus({ preventScroll: true });
  }
}

const root = document.querySelector<HTMLElement>('[data-resource-search]');
if (root) {
  try { new SearchController(root); }
  catch (error) { console.error('[MirrorN search] 无法初始化搜索界面；请使用分类目录', error); }
}
export {};
