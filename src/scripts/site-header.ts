/** 只测量吸顶区域；面包屑不吸顶，不计入锚点遮挡。 */
const header = document.querySelector<HTMLElement>('[data-site-header]');

if (header) {
  const measureHeader = (): void => {
    const value = `${Math.ceil(header.getBoundingClientRect().height)}px`;
    if (document.documentElement.style.getPropertyValue('--site-header-offset') !== value) {
      document.documentElement.style.setProperty('--site-header-offset', value);
      window.dispatchEvent(new Event('mirrorn:header-resize'));
    }
  };
  measureHeader();
  if ('ResizeObserver' in window) new ResizeObserver(measureHeader).observe(header);
  window.addEventListener('resize', measureHeader, { passive: true });
}

export {};
