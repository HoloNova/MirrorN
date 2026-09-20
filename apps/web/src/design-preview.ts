import './styles/index.css';

/**
 * 设计样张页的交互脚本。
 *
 * 这一页是开发用的设计参照（`pnpm dev:web` 后打开 /design-preview.html），不参与线上构建：
 * Vite 默认只把 index.html 作为入口，这里有交互只是为了能当场验证主题切换、读数条状态与
 * 复制反馈，不用反复手改 HTML。
 *
 * 页面上所有耗时数字都是示意值，脚本里也不连接任何镜像站。
 */

const THEME_STORAGE_KEY = 'mirrorn.theme';
const THEMES = ['system', 'survey', 'carbon'] as const;

type ThemeChoice = (typeof THEMES)[number];
type ThemeId = 'survey' | 'carbon';

/** 与 packages/shared 的 PROBE_LIMITS.timeoutMs 一致；样张里独立写一份，避免把构建产物牵连进来。 */
const PROBE_TIMEOUT_MS = 1500;

function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(choice: ThemeChoice): ThemeId {
  if (choice === 'system') {
    return prefersDark() ? 'carbon' : 'survey';
  }
  return choice;
}

/**
 * 刻度长度用与推荐算法同一个口径：`clamp(1 - 耗时 / 超时阈值, 0, 1)`。
 * 颜色分档只是这个分数的一个读法，所以同一根刻度不会出现“长度短但颜色好看”的矛盾。
 */
function delayScore(ms: number): number {
  return Math.min(Math.max(1 - ms / PROBE_TIMEOUT_MS, 0), 1);
}

function tierFor(score: number): 'fast' | 'fair' | 'slow' {
  if (score >= 0.75) return 'fast';
  if (score >= 0.5) return 'fair';
  return 'slow';
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${Math.floor(ms / 1000)} ${String(ms % 1000).padStart(3, '0')}` : `${ms}`;
}

function setPending(readout: HTMLElement): void {
  readout.dataset.state = 'pending';
  delete readout.dataset.tier;
  ensureFill(readout)?.style.setProperty('--value', '0');
  setValueText(readout, '测试中');
}

function setMeasured(readout: HTMLElement, ms: number): void {
  const score = delayScore(ms);
  readout.dataset.state = 'measured';
  readout.dataset.tier = tierFor(score);
  ensureFill(readout)?.style.setProperty('--value', score.toFixed(3));
  setValueText(readout, `${formatMs(ms)} ms`);
}

function ensureFill(readout: HTMLElement): HTMLElement | undefined {
  const track = readout.querySelector<HTMLElement>('.readout-track');
  if (!track) return undefined;
  let fill = track.querySelector<HTMLElement>('.readout-fill');
  if (!fill) {
    fill = document.createElement('span');
    fill.className = 'readout-fill';
    track.append(fill);
  }
  return fill;
}

function setValueText(readout: HTMLElement, text: string): void {
  const value = readout.querySelector<HTMLElement>('.readout-value');
  if (!value) return;
  const [number, ...rest] = text.split(' ');
  value.textContent = number;
  if (rest.length > 0) {
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = ` ${rest.join(' ')}`;
    value.append(unit);
  }
}

/** 依次把一组读数条从"测试中"推进到结果，让人看清刻度是怎么填出来的。 */
function measureRows(readouts: HTMLElement[]): void {
  readouts.forEach(setPending);
  readouts.forEach((readout, index) => {
    const scripted = Number(readout.dataset.demoMs ?? '0');
    window.setTimeout(() => setMeasured(readout, scripted), 420 + index * 260);
  });
}

function applyTheme(choice: ThemeChoice, persist: boolean): void {
  const theme = resolveTheme(choice);
  document.documentElement.dataset.theme = theme;
  document.title = `MirrorN 设计样张（开发用）· ${theme}`;

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')) {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
  }

  const label = document.querySelector<HTMLElement>('[data-resolved-theme]');
  if (label) {
    label.textContent = choice === 'system' ? `${theme}（跟随系统）` : theme;
  }

  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  }

  renderTokenValues();
}

/** 把当前主题里各个语义变量的实际取值填到色卡上：切换主题时这些值会跟着变。 */
function renderTokenValues(): void {
  const styles = getComputedStyle(document.documentElement);
  for (const element of document.querySelectorAll<HTMLElement>('[data-token]')) {
    const name = element.dataset.token ?? '';
    element.textContent = styles.getPropertyValue(name).trim();
  }
}

function wireThemeSwitcher(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')) {
    button.addEventListener('click', () => {
      const choice = button.dataset.themeChoice;
      if (isThemeChoice(choice)) {
        applyTheme(choice, true);
      }
    });
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'system') {
      applyTheme('system', false);
    }
  });
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function wireCopyButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    button.addEventListener('click', async () => {
      const label = button.querySelector('span');
      const text = button.dataset.copy ?? '';
      const ok = await writeClipboard(text);

      button.dataset.state = ok ? 'copied' : 'failed';
      button.querySelector('use')?.setAttribute('href', ok ? '#i-check' : '#i-copy');
      if (label) label.textContent = ok ? '已复制' : '复制失败';

      window.setTimeout(() => {
        button.removeAttribute('data-state');
        button.querySelector('use')?.setAttribute('href', '#i-copy');
        if (label) label.textContent = '复制';
      }, 1600);
    });
  }
}

function wireMeasureButtons(): void {
  const mirrorRows = [
    ...document.querySelectorAll<HTMLElement>('.mirror-option .readout[data-demo-ms]'),
  ];
  const remeasure = document.querySelector<HTMLButtonElement>('#remeasure');
  remeasure?.addEventListener('click', () => {
    measureRows(mirrorRows);
  });

  const start = document.querySelector<HTMLButtonElement>('#measure-start');
  const rows = document.querySelector<HTMLElement>('#measure-rows');
  start?.addEventListener('click', () => {
    if (!rows) return;
    rows.hidden = false;
    const readouts = [...rows.querySelectorAll<HTMLElement>('.readout[data-demo-ms]')];
    measureRows(readouts);
    const label = start.querySelector('span');
    if (label) label.textContent = '重新测量';
  });
}

/** 进度刻度与勾选框同步：这一节勾上，左侧目录的进度就前进一格。 */
function wireProgress(): void {
  const boxes = [...document.querySelectorAll<HTMLInputElement>('[data-progress]')];
  if (boxes.length === 0) return;

  const render = (): void => {
    const done = boxes.filter((box) => box.checked).length;
    for (const area of document.querySelectorAll<HTMLElement>('.toc-progress')) {
      const counter = area.querySelector('.num');
      if (counter) counter.textContent = String(done);
      area.querySelectorAll<HTMLElement>('.progress-tick').forEach((tick, index) => {
        tick.dataset.done = String(index < done);
      });
    }
  };

  boxes.forEach((box) => box.addEventListener('change', render));
  render();
}

wireThemeSwitcher();
wireCopyButtons();
wireMeasureButtons();
wireProgress();

const stored = localStorage.getItem(THEME_STORAGE_KEY);
applyTheme(isThemeChoice(stored) ? stored : 'survey', false);
