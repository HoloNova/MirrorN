import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DocumentHeading } from '../../content/parse/document-types.ts';
const positionTolerance = 2;
export default function PageToc({ headings }: { headings: readonly DocumentHeading[] }) {
  const container = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState('');
  const [wide, setWide] = useState(false);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const scroll = container.current;
    if (!scroll) return;
    const entries = headings.flatMap((heading) => { const element = document.getElementById(heading.id); return element ? [{ id: heading.id, element }] : []; });
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      const visible = entries.filter((entry) => entry.element.getClientRects().length > 0);
      if (!visible.length) return;
      const line = Number.parseFloat(getComputedStyle(visible[0]!.element).scrollMarginTop) || 0;
      const atEnd = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - positionTolerance;
      const selected = atEnd ? visible.at(-1)! : visible.findLast((entry) => entry.element.getBoundingClientRect().top <= line + positionTolerance) ?? visible[0]!;
      setCurrent(selected.id);
    };
    const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(update); };
    const screen = matchMedia('(min-width: 1200px)');
    const applyLayout = () => { setWide(screen.matches); setOpen(screen.matches); schedule(); };
    const events = ['scroll', 'resize', 'hashchange', 'pageshow', 'load', 'mirrorn:header-resize'];
    applyLayout();
    screen.addEventListener('change', applyLayout);
    for (const event of events) window.addEventListener(event, schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    const article = document.querySelector('[data-resource-article]');
    if (article) observer.observe(article);
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); observer.disconnect(); screen.removeEventListener('change', applyLayout); for (const event of events) window.removeEventListener(event, schedule); };
  }, [headings]);
  useEffect(() => {
    const element = container.current;
    const link = element?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!element || !link || !element.getClientRects().length) return;
    const bounds = element.getBoundingClientRect();
    const selected = link.getBoundingClientRect();
    if (selected.top < bounds.top) element.scrollTop += selected.top - bounds.top;
    else if (selected.bottom > bounds.bottom) element.scrollTop += selected.bottom - bounds.bottom;
  }, [current, open]);
  return <aside className="page-toc" aria-label="本页章节目录"><p className="page-toc__title" hidden={!wide}>本页目录</p>
    <details open={open} onToggle={(event) => { if (!wide) setOpen(event.currentTarget.open); }}><summary hidden={wide}>本页目录</summary>
      <nav aria-label="本页目录" className="page-toc__links" ref={container}><ol>{headings.map((heading) => <li key={heading.id} style={{ '--toc-depth': heading.depth - 2 } as CSSProperties}><a href={`#${encodeURIComponent(heading.id)}`} aria-current={current === heading.id ? 'location' : undefined}>{heading.text}</a></li>)}</ol></nav>
    </details>
  </aside>;
}
