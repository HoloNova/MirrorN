/**
 * 文档形态下的"我已完成"进度。
 *
 * 与旧向导的区别：进度**不做门禁**——任何章节的内容都不会因为没勾选而看不到，
 * 勾选只是给新手一个"我走到哪了"的锚点。因此这里只管读、写、计数，不管可见性。
 */

export const GUIDE_ACTIONS = ['configure', 'verify', 'restore'] as const;

export type GuideAction = (typeof GUIDE_ACTIONS)[number];

export const GUIDE_ACTION_LABELS: Record<GuideAction, string> = {
  configure: '配置命令',
  verify: '验证配置',
  restore: '恢复与还原',
};

const STORAGE_PREFIX = 'mirrorn.progress.';

export function progressStorageKey(ecosystemId: string): string {
  return `${STORAGE_PREFIX}${ecosystemId}`;
}

export interface ProgressStore {
  /** 该生态已完成哪些动作。 */
  read: (ecosystemId: string) => GuideAction[];
  toggle: (ecosystemId: string, action: GuideAction, done: boolean) => GuideAction[];
  /** 已完成动作数，用于目录栏的进度刻度。 */
  count: (ecosystemId: string) => number;
}

/**
 * 存储只保存动作名数组。读出来的内容要重新过滤：localStorage 是用户可改的边界，
 * 不能假设里面一定是我们写进去的东西（多出来的值会让进度显示超过总数）。
 */
export function parseProgress(raw: string | null): GuideAction[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return GUIDE_ACTIONS.filter((action) => parsed.some((item) => item === action));
  } catch {
    return [];
  }
}

export function createProgressStore(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage,
): ProgressStore {
  function read(ecosystemId: string): GuideAction[] {
    try {
      return parseProgress(storage?.getItem(progressStorageKey(ecosystemId)) ?? null);
    } catch {
      // 隐私模式下 localStorage 会抛异常：按没有进度处理，页面照常可用。
      return [];
    }
  }

  function write(ecosystemId: string, actions: GuideAction[]): void {
    try {
      storage?.setItem(progressStorageKey(ecosystemId), JSON.stringify(actions));
    } catch {
      // 写不进去（配额、隐私模式）只影响"记住进度"，不阻塞用户继续操作。
    }
  }

  return {
    read,
    count: (ecosystemId) => read(ecosystemId).length,
    toggle: (ecosystemId, action, done) => {
      const current = read(ecosystemId);
      const next = GUIDE_ACTIONS.filter((item) =>
        item === action ? done : current.includes(item),
      );
      write(ecosystemId, next);
      return next;
    },
  };
}
