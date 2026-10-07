import { useEffect, useState } from 'react';
const themes = ['system', 'light', 'dark'] as const;
type Theme = (typeof themes)[number];
const labels = { system: '跟随系统', light: '亮色', dark: '暗色' };
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    setTheme(stored === 'light' || stored === 'dark' ? stored : 'system');
    setReady(true);
  }, []);
  const next = themes[(themes.indexOf(theme) + 1) % themes.length]!;
  const label = `配色主题：${labels[theme]}；点击切换为${labels[next]}`;
  const toggle = () => {
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem('mirrorn-theme', next);
      setStatus(`配色主题已切换为${labels[next]}`);
    } catch {
      setStatus(`已切换为${labels[next]}；浏览器存储不可用，本次选择可能无法跨刷新保存。`);
    }
  };
  return <div className="theme-control" hidden={!ready}>
    <button className="theme-control__button" type="button" data-mode={theme} aria-label={label} title={label} onClick={toggle}>
      <svg className="theme-icon theme-icon--system" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M12 17v4m-4 0h8" /></svg>
      <svg className="theme-icon theme-icon--light" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
      <svg className="theme-icon theme-icon--dark" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 15A8.5 8.5 0 0 1 9 4a8.5 8.5 0 1 0 11 11Z" /></svg>
    </button><span className="visually-hidden" aria-live="polite">{status}</span>
  </div>;
}
