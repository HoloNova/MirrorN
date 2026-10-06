/* eslint vue/one-component-per-file: off -- Hono只读API，不是界面测试。 */
import { describe, it, expect, vi } from 'vitest';
import { createApp } from './app.js';
import { fixtureDownload, fixtureRun, indexFixture } from './db/indexFixture.js';
import { registerSoftware } from './db/installers.js';

async function json(app: ReturnType<typeof createApp>, path: string) {
  const response = await app.request(path);
  expect(response.status).toBe(200);
  return response.json();
}
describe('按需目录、身份合并及下载分页', () => {
  it('首页不查文件/版本/站点，npm不是Node.js；保留旧接口', async () => {
    const db = indexFixture();
    const network = vi.fn(() => {
      throw new Error('只读查询不得访问源站');
    });
    vi.stubGlobal('fetch', network);
    try {
      fixtureRun(db);
      const app = createApp({ db });
      expect((await json(app, '/api/catalog')).items).toEqual([]);
      for (const query of [
        'npm',
        'apt',
        'javascript',
        '北大',
        '24.1.0',
        'node-v24.1.0-x64.msi',
        'node%2024.1.0',
      ])
        expect((await json(app, `/api/catalog?q=${query}`)).items).toEqual([]);
      for (const query of ['node', 'nodejs', 'NODE.JS', 'ｎｏｄｅｊｓ']) {
        const result = await json(app, `/api/catalog?q=${encodeURIComponent(query)}`);
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({
          type: 'software',
          id: 'nodejs',
          name: 'Node.js',
          siteCount: 1,
        });
        expect(result.items[0]).not.toHaveProperty('siteName');
        expect(result.items[0]).not.toHaveProperty('artifacts');
      }
      expect((await json(app, '/api/resources?q=node%2024.1.0')).items).toHaveLength(1);
      expect((await json(app, '/api/catalog/resources/pku%3Anodejs-release')).id).toBe('nodejs');
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      db.close();
    }
  });
  it('同一软件的多来源只返回一条身份，地理位置不按高校性质猜测', async () => {
    const db = indexFixture();
    try {
      fixtureRun(db);
      db.exec(`INSERT INTO catalog_software_sites(site_id,software_id)
        SELECT s.id,w.id FROM catalog_sites s CROSS JOIN catalog_software w WHERE s.slug='ustc' AND w.slug='nodejs';
        INSERT INTO catalog_scopes(site_id,software_id,directory)
        SELECT s.id,w.id,'https://mirrors.ustc.edu.cn/nodejs-release/' FROM catalog_sites s CROSS JOIN catalog_software w WHERE s.slug='ustc' AND w.slug='nodejs';
        INSERT INTO catalog_downloads(version_id,site_id,scope_id,filename,url,platform,arch,format,seen_run,crawled_at)
        SELECT d.version_id,s.id,c.id,d.filename,'https://mirrors.ustc.edu.cn/nodejs-release/test.msi',d.platform,d.arch,d.format,d.seen_run,d.crawled_at
        FROM catalog_downloads d JOIN catalog_sites s ON s.slug='ustc' JOIN catalog_scopes c ON c.site_id=s.id LIMIT 1;`);
      const app = createApp({ db });
      const result = await json(app, '/api/catalog?q=node');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].siteCount).toBe(2);
      const detail = await json(app, '/api/catalog/software/nodejs');
      expect(detail).not.toHaveProperty('artifacts');
      expect(detail.candidates).toHaveLength(2);
      expect(detail.candidates.find((c: { siteId: string }) => c.siteId === 'pku').region).toBe(
        'CN',
      );
      expect(detail.candidates.find((c: { siteId: string }) => c.siteId === 'ustc').region).toBe(
        'unknown',
      );
    } finally {
      db.close();
    }
  });
  it('站点分页十条、不重不漏；筛选不受已加载页限制，游标绑定条件和修订', async () => {
    const db = indexFixture();
    try {
      for (let i = 0; i < 23; i += 1) {
        const slug = `fixture-tool-${i}`;
        registerSoftware(db, {
          slug,
          resourceKey: slug,
          name: `Fixture Tool ${String(i).padStart(2, '0')}`,
          aliases: [slug],
          category: 'toolchain',
          ecosystemId: 'kubernetes',
          repo: 'nodejs-release',
          kind: 'installer',
        });
        fixtureRun(db, [fixtureDownload(`fixture-${i}.msi`)], 1, undefined, slug);
      }
      const app = createApp({ db });
      const first = await json(app, '/api/catalog/sites/pku');
      expect(first.items).toHaveLength(10);
      expect(first.total).toBe(23);
      const second = await json(app, `/api/catalog/sites/pku?cursor=${first.nextCursor}`);
      const third = await json(app, `/api/catalog/sites/pku?cursor=${second.nextCursor}`);
      expect(second.items).toHaveLength(10);
      expect(third.items).toHaveLength(3);
      expect(third.nextCursor).toBeNull();
      expect(
        new Set([...first.items, ...second.items, ...third.items].map((item) => item.id)).size,
      ).toBe(23);
      expect((await json(app, '/api/catalog/sites/pku?q=fixture-tool-22')).items).toHaveLength(1);
      expect((await json(app, '/api/catalog/ecosystems/kubernetes')).total).toBe(23);
      expect(
        (await app.request(`/api/catalog/sites/pku?q=other&cursor=${first.nextCursor}`)).status,
      ).toBe(400);
      expect((await app.request('/api/catalog/sites/pku?cursor=invalid')).status).toBe(400);
      fixtureRun(db, [fixtureDownload('fixture-0.msi')], 2, undefined, 'fixture-tool-0');
      expect((await app.request(`/api/catalog/sites/pku?cursor=${first.nextCursor}`)).status).toBe(
        200,
      );
      fixtureRun(
        db,
        [fixtureDownload('fixture-0.msi'), fixtureDownload('fixture-0-extra.msi')],
        3,
        undefined,
        'fixture-tool-0',
      );
      expect((await app.request(`/api/catalog/sites/pku?cursor=${first.nextCursor}`)).status).toBe(
        409,
      );
    } finally {
      db.close();
    }
  });
  it('展开一次得到默认版本与十个文件；历史版本另行分页，文件跨更新重查', async () => {
    const db = indexFixture();
    try {
      const downloads = Array.from({ length: 23 }, (_, i) => fixtureDownload(`node-${i}.msi`));
      downloads.push(fixtureDownload('node-old.msi', 'v20.0.0'));
      for (let i = 8; i < 20; i += 1)
        downloads.push(fixtureDownload(`node-old-${i}.msi`, `v${i}.0.0`));
      fixtureRun(db, downloads, 1);
      const app = createApp({ db });
      const start = await json(
        app,
        '/api/resources/pku%3Anodejs-release/start?platform=windows&arch=x64',
      );
      expect(start.items).toHaveLength(10);
      expect(start.filters).toEqual({ platform: 'windows', arch: 'x64', version: 'v24.1.0' });
      expect(start.options.versionCount).toBe(14);
      expect(start.options).not.toHaveProperty('versions');
      const next = await json(
        app,
        `/api/files?resource=pku%3Anodejs-release&platform=windows&arch=x64&version=v24.1.0&limit=10&cursor=${start.nextCursor}`,
      );
      expect(next.items).toHaveLength(10);
      expect(new Set([...start.items, ...next.items].map((file) => file.url)).size).toBe(20);
      const versions = await json(
        app,
        '/api/resources/pku%3Anodejs-release/versions?platform=windows&arch=x64&search=20',
      );
      expect(versions.items).toEqual(['v20.0.0']);
      const history = await json(
        app,
        '/api/resources/pku%3Anodejs-release/versions?platform=windows&arch=x64',
      );
      const older = await json(
        app,
        `/api/resources/pku%3Anodejs-release/versions?platform=windows&arch=x64&cursor=${history.nextCursor}`,
      );
      expect(history.items).toHaveLength(10);
      expect(older.items).toHaveLength(4);
      expect(new Set([...history.items, ...older.items]).size).toBe(14);
      expect(
        (
          await app.request(
            `/api/resources/pku%3Anodejs-release/versions?cursor=${history.nextCursor}`,
          )
        ).status,
      ).toBe(400);
      const all = await json(app, '/api/resources/pku%3Anodejs-release/start?version=*');
      expect(all.filters.version).toBe('');
      fixtureRun(db, downloads, 2);
      expect(
        (
          await app.request(
            `/api/resources/pku%3Anodejs-release/versions?platform=windows&arch=x64&cursor=${history.nextCursor}`,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await app.request(
            `/api/files?resource=pku%3Anodejs-release&platform=windows&arch=x64&version=v24.1.0&limit=10&cursor=${start.nextCursor}`,
          )
        ).status,
      ).toBe(409);
      expect((await createApp().request('/api/catalog?q=node')).status).toBe(503);
      expect((await app.request('/api/catalog/software/missing')).status).toBe(404);
    } finally {
      db.close();
    }
  });
});
