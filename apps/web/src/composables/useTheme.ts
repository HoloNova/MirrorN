import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';

import {
  findTheme,
  isThemeChoice,
  readThemeChoice,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemeChoice,
  type ThemeId,
} from '../lib/theme';

/**
 * 主题的浏览器侧接入：把选择写到 `<html data-theme>`，并把用户选择存进 localStorage。
 *
 * 首屏防闪白不靠这里：那一步由 index.html 里的极小内联脚本完成（静态部署没有 SSR，
 * 等 JS bundle 执行完再上色会先白一下）。两处共用 `lib/theme.ts` 的同一套解析规则。
 */

export interface ThemeEnv {
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  prefersDark: () => boolean;
  /** 订阅系统深浅色变化；返回取消订阅函数。 */
  subscribeSystemChange: (handler: () => void) => () => void;
  apply: (theme: ThemeId) => void;
}

export function createBrowserThemeEnv(): ThemeEnv {
  const media =
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? undefined
      : window.matchMedia('(prefers-color-scheme: dark)');

  return {
    storage: globalThis.localStorage,
    prefersDark: () => media?.matches ?? false,
    subscribeSystemChange: (handler) => {
      if (!media) {
        return () => undefined;
      }
      media.addEventListener('change', handler);
      return () => media.removeEventListener('change', handler);
    },
    apply: (theme) => {
      document.documentElement.dataset.theme = theme;
      // 地址栏配色跟着主题走；meta 由 index.html 声明，这里只改内容。
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', findTheme(theme).metaColor);
      }
    },
  };
}

export interface ThemeAccess {
  choice: Ref<ThemeChoice>;
  /** 当前实际生效的主题 id（选择为"跟随系统"时是解析后的结果）。 */
  theme: Ref<ThemeId>;
  setChoice: (value: ThemeChoice) => void;
  dispose: () => void;
}

export function createThemeAccess(env: ThemeEnv): ThemeAccess {
  const choice = ref<ThemeChoice>(readThemeChoice(env.storage));
  const theme = ref<ThemeId>(resolveTheme(choice.value, env.prefersDark()));

  function render(): void {
    theme.value = resolveTheme(choice.value, env.prefersDark());
    env.apply(theme.value);
  }

  const unsubscribe = env.subscribeSystemChange(render);

  function dispose(): void {
    unsubscribe();
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose);
  }

  render();

  return {
    choice,
    theme,
    setChoice: (value) => {
      choice.value = value;
      render();
      try {
        env.storage?.setItem(THEME_STORAGE_KEY, value);
      } catch {
        // 存不进去只影响"下次打开还记得"，当前这次切换照常生效。
      }
    },
    dispose,
  };
}

export function useTheme(): ThemeAccess {
  return createThemeAccess(createBrowserThemeEnv());
}

/** 供测试与首屏脚本对照：判断某个存储值是否是合法的选择。 */
export { isThemeChoice };
