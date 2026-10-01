import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { indexFixture, fixtureFile, fixtureSnapshot } from './db/indexFixture.js';

describe('数据库资源查询与单站边界', () => {
  it('搜索、详情和文件过滤只读同一有效数据库，任何查询不联网', async () => {
    const db = indexFixture();
    fixtureSnapshot(db, 'one', [fixtureFile()]);
    const network = vi.fn(() => {
      throw new Error('查询不得访问源站');
    });
    vi.stubGlobal('fetch', network);
    try {
      const app = createApp({ db });
      const home = (await (
        await app.request('http://localhost/api/resources?q=debian&downloadable=1')
      ).json()) as { items: { id: string; downloadMode: string }[] };
      const site = (await (
        await app.request('http://localhost/api/sites/pku/resources')
      ).json()) as typeof home;
      expect(home.items.map((x) => x.id)).toEqual(site.items.map((x) => x.id));
      expect(home.items[0]?.downloadMode).toBe('files');
      const detail = (await (
        await app.request('http://localhost/api/resources/pku%3Adebian')
      ).json()) as { artifacts: { url: string }[] };
      const page = (await (
        await app.request(
          'http://localhost/api/files?resource=pku%3Adebian&package=hello&arch=amd64',
        )
      ).json()) as { items: { url: string }[] };
      expect(page.items[0]?.url).toBe(fixtureFile().url);
      expect(detail.artifacts[0]?.url).toBe(fixtureFile().url);
      expect(
        (await app.request('http://localhost/api/resources/pku%3Adebian/browse?path=pool')).status,
      ).toBe(410);
      expect(
        (await app.request('http://localhost/api/resources/pku%3Adebian/package?name=six')).status,
      ).toBe(410);
      expect((await app.request('http://localhost/api/files?resource=ustc%3Adebian')).status).toBe(
        404,
      );
      expect((await app.request('http://localhost/api/resources/ustc%3Adebian')).status).toBe(404);
      const other = (await (
        await app.request('http://localhost/api/resources?site=ustc')
      ).json()) as typeof home;
      expect(other.items).toHaveLength(0);
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      db.close();
    }
  });
  it('空库资源不冒充可下载；缺库与非法分页明确报错，不进行联网兜底', async () => {
    const db = indexFixture();
    try {
      const app = createApp({ db });
      const response = (await (
        await app.request('http://localhost/api/resources?downloadable=1')
      ).json()) as { items: unknown[] };
      expect(response.items).toHaveLength(0);
      expect(
        (await app.request('http://localhost/api/files?resource=pku%3Adebian&limit=0')).status,
      ).toBe(400);
      expect(
        (await app.request('http://localhost/api/files?resource=pku%3Adebian&cursor=invalid'))
          .status,
      ).toBe(400);
      expect(
        (await createApp().request('http://localhost/api/files?resource=pku%3Adebian')).status,
      ).toBe(503);
    } finally {
      db.close();
    }
  });
});
