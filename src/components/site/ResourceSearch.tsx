import { useEffect, useRef } from 'react';
import { contentCategories } from '../../content/categories.ts';
import { searchLimits } from '../../content/search/limits.ts';
import { useResourceSearch } from '../../hooks/useResourceSearch';

export default function ResourceSearch({ indexUrl, count }: { indexUrl: string; count: number }) {
  const search = useResourceSearch(indexUrl, count);
  const input = useRef<HTMLInputElement>(null);
  const selected = search.hits[search.active];
  useEffect(() => {
    if (!selected || !search.open) return;
    const option = document.getElementById(`search-result-${selected.id}`);
    if (!option) return;
    const rect = option.getBoundingClientRect();
    const header = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--site-header-offset')) || 0;
    if (rect.top < header || rect.bottom > window.innerHeight) option.scrollIntoView({ block: 'nearest' });
  }, [selected, search.open]);
  return <section className="resource-search" aria-label="资源搜索" data-search-index={indexUrl}>
    {/* 脚本就绪前输入框保持禁用但可见，避免首屏先空白再弹出搜索框。 */}
    <form action="/" method="get" role="search" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="resource-query" className="visually-hidden">搜索资源</label><div className="resource-search__controls">
        <svg className="resource-search__icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <input id="resource-query" name="q" ref={input} value={search.query} type="search" role="combobox" maxLength={searchLimits.queryLength} placeholder="搜索资源名称、别名、标签或拼音" autoComplete="off" spellCheck={false} enterKeyHint="go" aria-controls="resource-search-results" aria-expanded={search.open} aria-autocomplete="list" aria-describedby="resource-search-status" aria-activedescendant={search.open && selected ? `search-result-${selected.id}` : undefined} aria-busy={search.phase === 'loading'} disabled={!search.ready} onChange={(event) => search.change(event.target.value)} onFocus={search.focus} onKeyDown={search.onKey} onCompositionStart={search.compositionStart} onCompositionEnd={search.compositionEnd} />
        <button type="button" className="resource-search__clear" hidden={!search.query} aria-label="清空搜索" title="清空搜索" onClick={() => { search.change(''); input.current?.focus({ preventScroll: true }); }}><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      </div>
    </form>
    <p id="resource-search-status" className={search.open ? 'visually-hidden' : 'resource-search__status'} role="status" aria-live="polite" aria-atomic="true">{search.status}</p>
    <button type="button" hidden={search.phase !== 'failed'} onClick={() => { search.retry(); input.current?.focus({ preventScroll: true }); }}>重新加载搜索</button>
    <button type="button" hidden={search.phase !== 'failed'} onClick={search.reload}>刷新页面</button>
    <ol id="resource-search-results" role="listbox" aria-label="匹配的资源" hidden={!search.open}>{search.hits.map((record, index) => <li key={record.id} id={`search-result-${record.id}`} className="search-result" role="option" aria-selected={index === search.active}><a href={`/resources/${encodeURIComponent(record.id)}/`} tabIndex={-1}><strong>{record.name}</strong><span className="search-result__category">{contentCategories.find((category) => category.id === record.category)!.name}</span><p>{record.summary}</p></a></li>)}</ol>
    <noscript><p className="resource-search__status">搜索需要 JavaScript，可以直接浏览<a href="/resources/">已收录</a>。</p></noscript>
  </section>;
}
