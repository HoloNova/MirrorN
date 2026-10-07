import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { loadDirectoryData } from '../content/site.server.ts';
import { categoryAnchor } from '../content/navigation.ts';
export async function loader() { return loadDirectoryData(); }
export default function Directory() {
  const categories = useLoaderData<typeof loader>();
  useEffect(() => {
    const reveal = () => {
      let id: string;
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
      const category = document.getElementById(id);
      if (category instanceof HTMLDetailsElement && category.classList.contains('category')) { category.open = true; category.scrollIntoView({ block: 'start' }); }
    };
    reveal(); window.addEventListener('hashchange', reveal); window.addEventListener('pageshow', reveal);
    return () => { window.removeEventListener('hashchange', reveal); window.removeEventListener('pageshow', reveal); };
  }, []);
  return <section className="page-section" aria-labelledby="directory-title"><h1 id="directory-title">已收录</h1><p className="page-lede">按类别浏览人工整理的资源。展开分类，选择名称，阅读获取与使用说明。</p>
    <div className="category-list">{categories.map((category) => <details key={category.id} className="category" id={categoryAnchor(category.id)}>
      <summary className="category__summary"><svg className="category__chevron" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg><span className="category__name">{category.name}</span><span className="category__count">{category.resources.length} 项</span></summary>
      {category.resources.length ? <ul className="category__resources">{category.resources.map((resource) => <li key={resource.id}><a className="category__resource" href={`/resources/${resource.id}/`}>{resource.name}</a></li>)}</ul> : <p className="category__empty">尚未收录。</p>}
    </details>)}</div>
  </section>;
}
