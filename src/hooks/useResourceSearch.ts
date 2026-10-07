import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchLoader } from './useSearchLoader';
import { searchLimits } from '../content/search/limits.ts';
import { boundedQuery, normalizeQuery } from '../content/search/query.ts';


function persistQuery(value: string): void {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set('q', value); else url.searchParams.delete('q');
  if (url.href !== window.location.href) history.replaceState(history.state, '', url);
}

export function useResourceSearch(indexUrl: string, count: number) {
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [processed, setProcessed] = useState('');
  const { engine, phase, engineRef, load } = useSearchLoader(indexUrl);
  const [composing, setComposing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const queryRef = useRef('');
  useEffect(() => {
    const restore = () => {
      const value = boundedQuery(new URL(window.location.href).searchParams.get('q') ?? '');
      queryRef.current = value;
      setQuery(value); setProcessed(value); setComposing(false); setDismissed(false); setActive(-1);
    };
    restore(); setReady(true);
    window.addEventListener('popstate', restore);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('popstate', restore); window.removeEventListener('pageshow', restore);
    };
  }, [indexUrl]);
  useEffect(() => {
    if (!ready || composing) return;
    if (normalizeQuery(query)) load();
    const timer = window.setTimeout(() => { setProcessed(query); persistQuery(query); }, normalizeQuery(query) ? searchLimits.inputDelayMs : 0);
    return () => window.clearTimeout(timer);
  }, [query, ready, composing, load]);
  const hits = useMemo(() => !composing && query === processed && engine && normalizeQuery(query) ? engine.search(normalizeQuery(query)) : [], [query, processed, engine, composing]);
  const change = (value: string) => { const next = boundedQuery(value); queryRef.current = next; setQuery(next); setActive(-1); setDismissed(false); };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (composing || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    const value = queryRef.current;
    setProcessed(value); persistQuery(value);
    if (event.key === 'Escape') { setDismissed(true); setActive(-1); return; }
    setDismissed(false); load();
    const results = engineRef.current && normalizeQuery(value) ? engineRef.current.search(normalizeQuery(value)) : [];
    if (!results.length) return;
    if (event.key === 'Enter') { window.location.assign(`/resources/${encodeURIComponent(results[active >= 0 && active < results.length ? active : 0]!.id)}/`); return; }
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    setActive(active < 0 ? direction > 0 ? 0 : results.length - 1 : (active + direction + results.length) % results.length);
  };
  const status = !ready ? '搜索尚未启用，可以直接浏览已收录目录。' : phase === 'failed' ? '搜索暂时不可用。请重试；模块仍不可用时刷新页面，或从已收录目录浏览资源。' : composing ? '输入完成后开始搜索。' : dismissed ? '已收起结果，查询仍保留；再次输入或按方向键可继续搜索。' : phase === 'loading' && normalizeQuery(query) ? '正在加载搜索索引…' : query !== processed ? '正在检索…' : !normalizeQuery(query) ? count === 0 ? '当前暂无公开资源，可以查看已收录目录。' : '输入资源名称、别名、简介、标签或显式拼音；↑↓ 选择，Enter 打开，Esc 收起结果。' : !hits.length ? `没有找到“${query}”。试试别名或标签，也可以浏览分类目录。` : `显示 ${hits.length} 个匹配结果（最多 ${searchLimits.resultCount} 个）。↑↓ 选择，Enter 打开。`;
  return { ready, query, hits, active, status, phase, open: !dismissed && hits.length > 0, change, onKey,
    focus: () => { setDismissed(false); load(); }, retry: () => load(true),
    reload: () => { persistQuery(queryRef.current); window.location.reload(); },
    compositionStart: () => { setComposing(true); setActive(-1); }, compositionEnd: () => setComposing(false) };
}
