import { describe, expect, it } from 'vitest';

import {
  createProgressStore,
  GUIDE_ACTIONS,
  parseProgress,
  progressStorageKey,
} from './guideProgress';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    snapshot: () => Object.fromEntries(data),
  };
}

describe('parseProgress', () => {
  it('只保留已知动作，并按固定顺序输出', () => {
    expect(parseProgress(JSON.stringify(['restore', 'configure', 'unknown']))).toEqual([
      'configure',
      'restore',
    ]);
  });

  it('非法 JSON、非数组、空值都按没有进度处理', () => {
    expect(parseProgress(null)).toEqual([]);
    expect(parseProgress('')).toEqual([]);
    expect(parseProgress('not json')).toEqual([]);
    expect(parseProgress('{"configure":true}')).toEqual([]);
  });
});

describe('createProgressStore', () => {
  it('toggle 写入与读出对称，并保留其它动作', () => {
    const storage = createMemoryStorage();
    const store = createProgressStore(storage);

    expect(store.count('npm')).toBe(0);

    store.toggle('npm', 'configure', true);
    store.toggle('npm', 'verify', true);
    expect(store.read('npm')).toEqual(['configure', 'verify']);
    expect(store.count('npm')).toBe(2);

    store.toggle('npm', 'configure', false);
    expect(store.read('npm')).toEqual(['verify']);
  });

  it('进度按生态隔离，互不影响', () => {
    const storage = createMemoryStorage();
    const store = createProgressStore(storage);

    store.toggle('npm', 'configure', true);

    expect(store.read('pip')).toEqual([]);
    expect(storage.snapshot()[progressStorageKey('npm')]).toBeDefined();
  });

  it('存储里有脏数据时不会把进度算超', () => {
    const storage = createMemoryStorage({
      [progressStorageKey('npm')]: JSON.stringify(['configure', 'configure', 'nope']),
    });
    const store = createProgressStore(storage);

    expect(store.count('npm')).toBe(GUIDE_ACTIONS.length - 2);
  });

  it('存储不可用时不影响调用方（读空、写入静默失败）', () => {
    const store = createProgressStore({
      getItem: () => {
        throw new Error('被禁用');
      },
      setItem: () => {
        throw new Error('被禁用');
      },
    });

    expect(store.read('npm')).toEqual([]);
    expect(() => store.toggle('npm', 'configure', true)).not.toThrow();
    expect(store.count('npm')).toBe(0);
  });
});
