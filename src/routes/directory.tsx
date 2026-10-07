import { useEffect, useRef, useState } from 'react';
import { useLoaderData } from 'react-router';
import { loadDirectoryData } from '../content/site.server.ts';
import { categoryAnchor } from '../content/navigation.ts';
import CategoryIcon from '../components/site/CategoryIcon';
export async function loader() { return loadDirectoryData(); }
export default function Directory() {
  const categories = useLoaderData<typeof loader>();
  const list = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  // 展开状态只存在于原生 details 上；按钮文字从 DOM 回读，手动展开最后一个分类时也能同步成“全部收起”。
  const sync = () => setAllOpen([...list.current?.querySelectorAll('details') ?? []].every((details) => details.open));
  useEffect(() => {
    setReady(true);
    const reveal = () => {
      let id: string;
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
      const category = document.getElementById(id);
      if (category instanceof HTMLDetailsElement && category.classList.contains('category')) { category.open = true; category.scrollIntoView({ block: 'start' }); }
    };
    reveal(); window.addEventListener('hashchange', reveal); window.addEventListener('pageshow', reveal);
    return () => { window.removeEventListener('hashchange', reveal); window.removeEventListener('pageshow', reveal); };
  }, []);
  const toggleAll = () => { for (const details of list.current?.querySelectorAll('details') ?? []) details.open = !allOpen; };
  return <section className="page-section directory" aria-labelledby="directory-title">
    <div className="directory__header"><h1 id="directory-title">已收录</h1><button type="button" className="directory__toggle" hidden={!ready} aria-controls="category-list" onClick={toggleAll}>{allOpen ? '全部收起' : '全部展开'}</button></div>
    <div className="category-list" id="category-list" ref={list}>{categories.map((category) => <details key={category.id} className="category" id={categoryAnchor(category.id)} onToggle={sync}>
      <summary className="category__summary"><CategoryIcon category={category.id} className="category__icon" /><span className="category__name">{category.name}</span><span className="category__count">{category.resources.length}<span className="visually-hidden"> 项</span></span><svg className="category__chevron" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg></summary>
      {category.resources.length ? <ul className="category__resources">{category.resources.map((resource) => <li key={resource.id}><a className="resource-tile" href={`/resources/${resource.id}/`}>
        <span className="resource-tile__text"><span className="resource-tile__name">{resource.name}</span><span className="resource-tile__summary">{resource.summary}</span></span>
        {'src' in resource.image ? <img className="resource-tile__image" src={resource.image.src} alt="" width={48} height={48} loading="lazy" decoding="async" /> : <CategoryIcon category={resource.image.category} className="resource-tile__image resource-tile__image--icon" />}
      </a></li>)}</ul> : <p className="category__empty">尚未收录。</p>}
    </details>)}</div>
  </section>;
}
