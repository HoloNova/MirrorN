/** 用正文现有标题确定当前章节，不解析文档、不随滚动改写 URL。 */
const POSITION_TOLERANCE = 2; // CSS 像素取整时仍能认出页面末尾与锚点。
function revealTocLink(container: HTMLElement, link: HTMLElement): void {
  if (container.getClientRects().length === 0) return;
  const bounds = container.getBoundingClientRect();
  const current = link.getBoundingClientRect();
  if (current.top < bounds.top) container.scrollTop += current.top - bounds.top;
  else if (current.bottom > bounds.bottom) container.scrollTop += current.bottom - bounds.bottom;
}

function initializeToc(toc: HTMLElement, article: HTMLElement): void {
  const disclosure = toc.querySelector<HTMLDetailsElement>('[data-toc-disclosure]');
  const summary = toc.querySelector<HTMLElement>('[data-toc-summary]');
  const title = toc.querySelector<HTMLElement>('[data-toc-title]');
  const container = toc.querySelector<HTMLElement>('[data-toc-scroll]');
  if (!disclosure || !summary || !title || !container) return;
  const entries = [...toc.querySelectorAll<HTMLAnchorElement>('[data-toc-target]')].flatMap((link) => {
    const heading = document.getElementById(link.dataset.tocTarget ?? '');
    return heading && article.contains(heading) ? [{ link, heading }] : [];
  });
  if (!entries.length) return;

  let scheduled = false;
  const update = (): void => {
    scheduled = false;
    const visible = entries.filter(({ heading }) => heading.getClientRects().length > 0);
    if (!visible.length) return;
    const readingLine = Number.parseFloat(getComputedStyle(visible[0]!.heading).scrollMarginTop) || 0;
    const atEnd = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - POSITION_TOLERANCE;
    const current = atEnd ? visible.at(-1)! : visible.findLast(({ heading }) => heading.getBoundingClientRect().top <= readingLine + POSITION_TOLERANCE) ?? visible[0]!;
    const changed = current.link.getAttribute('aria-current') !== 'location';
    for (const entry of entries) {
      if (entry === current) entry.link.setAttribute('aria-current', 'location');
      else entry.link.removeAttribute('aria-current');
    }
    if (changed) revealTocLink(container, current.link);
  };
  const schedule = (): void => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
  };
  const wideScreen = window.matchMedia('(min-width: 1200px)');
  const applyLayout = (): void => {
    disclosure.open = wideScreen.matches;
    summary.hidden = wideScreen.matches;
    title.hidden = !wideScreen.matches;
    schedule();
  };
  applyLayout();
  wideScreen.addEventListener('change', applyLayout);
  for (const event of ['scroll', 'resize', 'hashchange', 'pageshow', 'load', 'mirrorn:header-resize']) {
    window.addEventListener(event, schedule, { passive: true });
  }
  disclosure.addEventListener('toggle', () => {
    const current = entries.find(({ link }) => link.hasAttribute('aria-current'));
    if (current) revealTocLink(container, current.link);
    schedule();
  });
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(article);
}

const toc = document.querySelector<HTMLElement>('[data-page-toc]');
const article = document.querySelector<HTMLElement>('[data-resource-article]');
if (toc && article) initializeToc(toc, article);
export {};
