import { useEffect, useRef } from 'react';
import { siteConfig } from '../../../config/site.ts';
import ThemeToggle from './ThemeToggle';
const navItems = [{ href: '/', label: '首页' }, { href: '/resources/', label: '已收录' }, { href: '/about/', label: '关于本站' }];
export default function SiteHeader({ pathname }: { pathname: string }) {
  const header = useRef<HTMLElement>(null);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = header.current;
    const navigation = nav.current;
    if (!element || !navigation) return;
    const update = () => {
      const value = `${Math.ceil(element.getBoundingClientRect().height)}px`;
      if (document.documentElement.style.getPropertyValue('--site-header-offset') !== value) {
        document.documentElement.style.setProperty('--site-header-offset', value);
        window.dispatchEvent(new Event('mirrorn:header-resize'));
      }
      const current = navigation.querySelector<HTMLElement>('[aria-current="page"]');
      if (current) navigation.scrollLeft += current.getBoundingClientRect().left - navigation.getBoundingClientRect().left - (navigation.clientWidth - current.getBoundingClientRect().width) / 2;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(navigation);
    window.addEventListener('resize', update, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [pathname]);
  return <header className="site-header" ref={header}>
    <div className="page-container site-header__inner"><a className="site-header__brand" href="/">{siteConfig.siteName}</a>
      <nav className="site-nav" aria-label="主导航" ref={nav}><ul className="site-nav__list">{navItems.map((item) => <li key={item.href}><a className="site-nav__link" href={item.href} aria-current={(item.href === '/' ? pathname === '/' : `${pathname.replace(/\/$/u, '')}/`.startsWith(item.href)) ? 'page' : undefined}>{item.label}</a></li>)}</ul></nav>
      <div className="site-header__actions">{siteConfig.repositoryUrl && <a className="site-header__repo" href={siteConfig.repositoryUrl} rel="noopener" title="项目仓库"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7 4 12l5 5m6-10 5 5-5 5M13 5l-2 14" /></svg><span className="site-header__repo-label">项目仓库</span></a>}<ThemeToggle /></div>
    </div>
  </header>;
}
