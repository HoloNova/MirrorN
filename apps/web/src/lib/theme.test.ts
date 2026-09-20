import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THEME,
  findTheme,
  isThemeChoice,
  isThemeId,
  readThemeChoice,
  resolveTheme,
  systemTheme,
} from './theme';

describe('主题解析', () => {
  it('未存过选择时用默认主题，而不是跟随系统', () => {
    const storage = { getItem: () => null };

    expect(readThemeChoice(storage)).toBe(DEFAULT_THEME);
    expect(resolveTheme(readThemeChoice(storage), true)).toBe(DEFAULT_THEME);
  });

  it('存过具体主题时按存的来，系统偏好不覆盖它', () => {
    const storage = { getItem: () => 'survey' };

    expect(resolveTheme(readThemeChoice(storage), true)).toBe('survey');
  });

  it('选择"跟随系统"时解析成注册表里的深色主题', () => {
    const storage = { getItem: () => 'system' };

    expect(readThemeChoice(storage)).toBe('system');
    expect(resolveTheme('system', true)).toBe(systemTheme(true));
    expect(resolveTheme('system', false)).toBe(DEFAULT_THEME);
    expect(findTheme(systemTheme(true)).scheme).toBe('dark');
  });

  it('存储里是非法值或读取抛异常时退回默认主题', () => {
    expect(readThemeChoice({ getItem: () => 'not-a-theme' })).toBe(DEFAULT_THEME);
    expect(readThemeChoice(undefined)).toBe(DEFAULT_THEME);
    expect(
      readThemeChoice({
        getItem: () => {
          throw new Error('localStorage 被禁用');
        },
      }),
    ).toBe(DEFAULT_THEME);
  });

  it('只接受注册表里的主题 id', () => {
    expect(isThemeId('carbon')).toBe(true);
    expect(isThemeId('system')).toBe(false);
    expect(isThemeChoice('system')).toBe(true);
    expect(isThemeChoice(null)).toBe(false);
  });
});
