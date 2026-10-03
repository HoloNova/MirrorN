/* eslint vue/one-component-per-file: off -- createApp是Hono HTTP应用，不是Vue组件；本文件只测API。 */
import { describe, it, expect, vi } from 'vitest';
import { createApp } from './app.js';
import { indexFixture, fixtureDownload, fixtureRun } from './db/indexFixture.js';

describe('统一只读安装目录API', () => {
  it('搜索、生态＋版本、站点、详情、筛选都来自有效数据库，全部禁网', async () => {
    const db = indexFixture();
    fixtureRun(db);
    const network = vi.fn(() => {
      throw new Error('查询不得访问源站');
    });
    vi.stubGlobal('fetch', network);
    try {
      const app = createApp({ db });
      const home = (await (await app.request('/api/resources?q=node%2024.1.0')).json()) as {
        items: { id: string; downloadMode: string }[];
      };
      const site = (await (
        await app.request('/api/sites/pku/resources?downloadable=1')
      ).json()) as typeof home;
      expect(home.items.map((r) => r.id)).toEqual(site.items.map((r) => r.id));
      expect(home.items[0]?.downloadMode).toBe('files');
      expect(
        (await (await app.request('/api/resources?ecosystem=nodejs&version=24.1.0')).json()).items,
      ).toHaveLength(1);
      const detail = (await (await app.request('/api/resources/pku%3Anodejs-release')).json()) as {
        artifacts: { url: string }[];
      };
      const page = (await (
        await app.request(
          '/api/files?resource=pku%3Anodejs-release&version=v24.1.0&platform=windows&arch=x64',
        )
      ).json()) as { items: { url: string }[] };
      expect(detail.artifacts[0]?.url).toBe(fixtureDownload().url);
      expect(page.items[0]?.url).toBe(fixtureDownload().url);
      expect((await app.request('/api/resources/pku%3Anodejs-release/browse')).status).toBe(410);
      expect(
        (await app.request('/api/resources/pku%3Anodejs-release/package?name=six')).status,
      ).toBe(410);
      expect((await app.request('/api/resources/pku%3Adebian')).status).toBe(200);
      const ecosystems = (await (await app.request('/api/ecosystems')).json()).items as {
        id: string;
        resourceCount: number;
      }[];
      expect(ecosystems.length).toBeGreaterThan(5);
      expect(ecosystems.some((e) => e.id === 'epel')).toBe(true);
      expect((await app.request('/api/resources/ustc%3Anodejs-release')).status).toBe(404);
      expect((await (await app.request('/api/resources?site=ustc')).json()).items).toEqual([]);
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      db.close();
    }
  });
  it('缺库明确503，空库不冒充下载，非法分页400，跨更新分页409', async () => {
    const db = indexFixture();
    try {
      const app = createApp({ db });
      expect((await (await app.request('/api/resources?downloadable=1')).json()).items).toEqual([]);
      expect((await app.request('/api/files?resource=pku%3Anodejs-release&limit=0')).status).toBe(
        400,
      );
      expect(
        (await app.request('/api/files?resource=pku%3Anodejs-release&cursor=invalid')).status,
      ).toBe(400);
      expect((await createApp().request('/api/files?resource=pku%3Anodejs-release')).status).toBe(
        503,
      );
      fixtureRun(db, [fixtureDownload('a.msi'), fixtureDownload('b.msi')], 1);
      const first = (await (
        await app.request('/api/files?resource=pku%3Anodejs-release&limit=1')
      ).json()) as { nextCursor: string };
      fixtureRun(db, [fixtureDownload('a.msi'), fixtureDownload('c.msi')], 2);
      expect(
        (
          await app.request(
            `/api/files?resource=pku%3Anodejs-release&cursor=${encodeURIComponent(first.nextCursor)}`,
          )
        ).status,
      ).toBe(409);
    } finally {
      db.close();
    }
  });
});
