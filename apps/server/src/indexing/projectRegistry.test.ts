import { describe, it, expect } from 'vitest';
import { indexFixture } from '../db/indexFixture.js';
import { dispatchProjects, rememberProjects } from './projectRegistry.js';
import { executeIndexJob } from './adapters.js';
import { SourceClient } from './source.js';

describe('大型项目目录与有界派发', () => {
  it('完整根索引只存入口，不一次派发所有项目；失败入队不推进游标', async () => {
    const db = indexFixture();
    try {
      const names = Array.from({ length: 1201 }, (_, i) => `pkg-${String(i).padStart(5, '0')}`);
      const enqueue = async () => {
        throw Error('根索引不应直接扇出队列');
      };
      const source = new SourceClient(
        (async () =>
          new Response(
            `<html><body>${names.map((name) => `<a href="${name}/">${name}</a>`).join('')}</body></html>`,
          )) as typeof fetch,
      );
      await executeIndexJob(
        db,
        {
          kind: 'pypi-root',
          resourceId: 'pku:pypi',
          protocol: 'pypi',
          indexUrl: 'https://mirrors.pku.edu.cn/pypi/web/simple/',
          baseUrl: 'https://mirrors.pku.edu.cn/pypi/',
        },
        'root',
        source,
        enqueue,
      );
      expect(db.prepare('SELECT COUNT(*) AS n FROM discovered_projects').get()?.n).toBe(1201);
      let jobs = 0;
      const first = await dispatchProjects(db, '', async (tasks) => {
        jobs += tasks.length;
      });
      expect(first.discovered).toBe(500);
      expect(jobs).toBe(500);
      await expect(
        dispatchProjects(db, first.cursor, async () => {
          throw Error('Redis失联');
        }),
      ).rejects.toThrow('Redis失联');
      const second = await dispatchProjects(db, first.cursor, async (tasks) => {
        expect(tasks[0]?.kind).toBe('pypi-project');
        jobs += tasks.length;
      });
      expect(second.discovered).toBe(500);
      const last = await dispatchProjects(db, second.cursor, async (tasks) => {
        jobs += tasks.length;
      });
      expect(last.discovered).toBe(201);
      expect(jobs).toBe(1201);
      expect(await dispatchProjects(db, last.cursor, async () => {})).toEqual({
        cursor: '',
        discovered: 0,
      });
      expect(db.prepare('SELECT COUNT(*) AS n FROM files').get()?.n).toBe(0);
    } finally {
      db.close();
    }
  });
  it('恢复旧任务时先保存入口，重复迁入幂等且拒绝外站URL', () => {
    const db = indexFixture();
    try {
      const p = { name: 'six', indexUrl: 'https://mirrors.pku.edu.cn/pypi/web/simple/six/' };
      rememberProjects(db, [p, p]);
      expect(db.prepare('SELECT COUNT(*) AS n FROM discovered_projects').get()?.n).toBe(1);
      expect(() =>
        rememberProjects(db, [{ name: 'bad', indexUrl: 'https://pypi.org/simple/bad/' }]),
      ).toThrow();
      expect(db.prepare('SELECT COUNT(*) AS n FROM discovered_projects').get()?.n).toBe(1);
    } finally {
      db.close();
    }
  });
});
