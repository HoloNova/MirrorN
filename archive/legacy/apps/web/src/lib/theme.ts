/**
 * 主题注册表与解析规则。
 *
 * 契约（见 docs/design-system.md 第 3 节）：
 *   1. 写进 `<html data-theme>` 的必须是一个**具体**主题 id，不写 `system`；「跟随系统」在这里
 *      解析成具体 id。这样 CSS 只认识具体主题，加主题不需要写媒体查询分支。
 *   2. 加主题 = 新增 `styles/themes/<id>.css` + 本文件注册表加一项 + 在 index.html 的首屏内联脚本
 *      白名单里加同一项（内联脚本不能 import，只能重复这几行）。`theme.test.ts` 会校验三者一致。
 */

export type ThemeId = 'survey' | 'carbon';

/** 用户的选择：具体主题，或跟随系统。 */
export type ThemeChoice = ThemeId | 'system';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  scheme: 'light' | 'dark';
  /** 主题选择器里用的预览色：底色与结构色。 */
  preview: { surface: string; accent: string };
  /** 移动端浏览器地址栏配色，由首屏脚本与 useTheme 同步写入 <meta name="theme-color">。 */
  metaColor: string;
}

export const DEFAULT_THEME: ThemeId = 'survey';
export const THEME_STORAGE_KEY = 'mirrorn.theme';

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'survey',
    label: '测绘图',
    scheme: 'light',
    preview: { surface: '#fcfcfb', accent: '#2049e6' },
    metaColor: '#fcfcfb',
  },
  {
    id: 'carbon',
    label: '碳黑',
    scheme: 'dark',
    preview: { surface: '#0f1114', accent: '#6f8cff' },
    metaColor: '#0f1114',
  },
];

export function findTheme(id: ThemeId): ThemeDefinition {
  const theme = THEMES.find((item) => item.id === id);
  if (!theme) {
    // 注册表是自己维护的常量表，取不到说明 id 与表不一致，属于编码错误。
    throw new Error(`未注册的主题：${id}`);
  }
  return theme;
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((theme) => theme.id === value);
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || isThemeId(value);
}

/** 从存储里读用户选择；非法值与读取失败（隐私模式）都退回默认主题。 */
export function readThemeChoice(storage: Pick<Storage, 'getItem'> | undefined): ThemeChoice {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY);
    if (isThemeChoice(raw)) {
      return raw;
    }
  } catch {
    // localStorage 在部分隐私模式下会抛异常：按没存过处理。
  }
  return DEFAULT_THEME;
}

/**
 * 「跟随系统」取注册表里第一个深色主题；没有深色主题时保持默认主题。
 * 用注册表推导而不是写死 carbon，这样以后换深色主题不用改这里。
 */
export function systemTheme(prefersDark: boolean): ThemeId {
  if (!prefersDark) {
    return DEFAULT_THEME;
  }
  return THEMES.find((theme) => theme.scheme === 'dark')?.id ?? DEFAULT_THEME;
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ThemeId {
  return choice === 'system' ? systemTheme(prefersDark) : choice;
}
