/* eslint vue/one-component-per-file: off -- Hono只读API，不是UI测试。 */
import { describe, it, expect, vi } from 'vitest';
import { createApp } from '../app.js';
import { indexFixture } from '../db/indexFixture.js';
import { getResource, searchResources, listSites } from '../db/catalog.js';
import { queryFiles } from '../db/fileQueries.js';
import { executeInstallerJob, installerTaskKey, type InstallerJob } from './installers.js';
import { loadDownloadRules } from './rules/load.js';
import { resourceSite } from './policy.js';
import { SourceClient } from './source.js';

const rules = loadDownloadRules();
const files = ['node-v24.1.0-x64.msi', 'node-v24.1.0-linux-x64.tar.xz'];
type Task = Extract<InstallerJob, { kind: 'directory' }>;
function task(site: 'pku' | 'tsinghua', epoch = 1): Task {
  return {
    kind: 'directory',
    bindingId: `${site}-nodejs`,
    directory: `${resourceSite(site).origin}/nodejs-release/`,
    epoch,
    depth: 0,
    ruleRevision: rules.revision,
  };
}
function html(path: string, names: string[]) {
  return `<html><title>Index of ${path} | Mirror directory</title><body><table>${names.map((name) => `<tr><td class="link"><a href="${name}">${name}</a></td><td class="size">${name.endsWith('/') ? '-' : '30.5 MiB'}</td></tr>`).join('')}</table></body></html>`;
}
function source(site: 'pku' | 'tsinghua', names = files, directories = ['v24.1.0/']) {
  const fetchImpl = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    const root = path === '/files/nodejs-release/' || path === '/nodejs-release/';
    if (site === 'pku')
      return Response.json(
        root
          ? directories.map((name) => ({ name: name.replace(/\/$/, ''), type: 'directory' }))
          : names.map((name) => ({ name, type: 'other', size: 100 })),
      );
    return new Response(html(path, root ? directories : names), {
      headers: { 'content-type': 'text/html' },
    });
  });
  return { fetchImpl, client: new SourceClient(fetchImpl) };
}
async function publish(
  db: ReturnType<typeof indexFixture>,
  site: 'pku' | 'tsinghua',
  epoch = 1,
  names = files,
) {
  const s = source(site, names),
    children: InstallerJob[] = [];
  await executeInstallerJob(
    db,
    task(site, epoch),
    s.client,
    async (jobs) => {
      children.push(...jobs);
    },
    rules,
  );
  const leaf = children[0] as Task;
  await executeInstallerJob(db, leaf, s.client, async () => {}, rules);
  return leaf;
}
function urls(db: ReturnType<typeof indexFixture>, site: string) {
  return queryFiles(db, { resource: `${site}:nodejs-release` }).items.map((file) => file.url);
}
describe('审核绑定通过统一采集链路接入多来源', () => {
  it('JSON与真实HTML结构都发布，首页身份去重、站点查询隔离，清华入口可节流', async () => {
    const db = indexFixture();
    try {
      await publish(db, 'pku');
      await publish(db, 'tsinghua');
      const network = vi.fn(() => {
        throw new Error('目录查询不能访问上游');
      });
      vi.stubGlobal('fetch', network);
      const app = createApp({ db });
      const result = await (await app.request('/api/catalog?q=node')).json();
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ id: 'nodejs', siteCount: 2 });
      const detail = await (await app.request('/api/catalog/software/nodejs')).json();
      expect(
        detail.candidates
          .map((c: { siteId: string; region: string }) => [c.siteId, c.region])
          .sort(),
      ).toEqual([
        ['pku', 'CN'],
        ['tsinghua', 'CN'],
      ]);
      expect(searchResources(db, { siteId: 'tsinghua' }).map((r) => r.id)).toEqual([
        'tsinghua:nodejs-release',
      ]);
      expect(getResource(db, 'tsinghua:nodejs-release')).toMatchObject({
        repoId: 'nodejs-release',
        artifactCount: 2,
      });
      expect(listSites(db).find((s) => s.id === 'tsinghua')).toMatchObject({
        enabled: true,
        resourceCount: 1,
      });
      expect(listSites(db).find((s) => s.id === 'ustc')).toMatchObject({
        enabled: false,
        resourceCount: 0,
      });
      const page = await (await app.request('/api/catalog/sites/tsinghua')).json();
      expect(page.items.map((item: { id: string }) => item.id)).toEqual([
        'tsinghua:nodejs-release',
      ]);
      expect(
        queryFiles(db, { resource: 'tsinghua:nodejs-release' }).items.every(
          (f) => f.sizeEstimated === true,
        ),
      ).toBe(true);
      expect(
        queryFiles(db, { resource: 'pku:nodejs-release' }).items.every((f) => !f.sizeEstimated),
      ).toBe(true);
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      db.close();
    }
  }, 10000);
  it('他站更新不让本站文件游标失效，本站自己更新才409；跨站复用游标400', async () => {
    const db = indexFixture();
    try {
      const pkuLeaf = await publish(db, 'pku');
      await publish(db, 'tsinghua');
      const first = queryFiles(db, { resource: 'pku:nodejs-release', limit: 1 });
      expect(first.nextCursor).toBeTruthy();
      await publish(db, 'tsinghua', 2, [...files, 'node-v24.1.0-linux-arm64.tar.xz']);
      const rest = queryFiles(db, {
        resource: 'pku:nodejs-release',
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect(rest.items).toHaveLength(1);
      expect(rest.items.every((f) => f.url.startsWith(resourceSite('pku').origin))).toBe(true);
      expect(() =>
        queryFiles(db, {
          resource: 'tsinghua:nodejs-release',
          limit: 1,
          cursor: first.nextCursor!,
        }),
      ).toThrow('无效或过期');
      await executeInstallerJob(
        db,
        pkuLeaf,
        source('pku', [...files, 'node-v24.1.0-linux-arm64.tar.xz']).client,
        async () => {},
        rules,
      );
      expect(() =>
        queryFiles(db, { resource: 'pku:nodejs-release', limit: 1, cursor: first.nextCursor! }),
      ).toThrow('已更新');
    } finally {
      db.close();
    }
  }, 15000);
  it('清华错误页保旧；撤销清华子目录不能删北大的同软件文件', async () => {
    const db = indexFixture();
    try {
      await publish(db, 'pku');
      const leaf = await publish(db, 'tsinghua');
      const beforePku = urls(db, 'pku'),
        beforeTuna = urls(db, 'tsinghua');
      const bad = new SourceClient(
        async () =>
          new Response('<html><title>Access denied</title></html>', {
            headers: { 'content-type': 'text/html' },
          }),
      );
      await expect(executeInstallerJob(db, leaf, bad, async () => {}, rules)).rejects.toThrow(
        '不是当前目录',
      );
      expect(urls(db, 'pku')).toEqual(beforePku);
      expect(urls(db, 'tsinghua')).toEqual(beforeTuna);
      await executeInstallerJob(
        db,
        task('tsinghua', 3),
        source('tsinghua', files, ['v22.0.0/']).client,
        async () => {},
        rules,
      );
      expect(urls(db, 'tsinghua')).toEqual([]);
      expect(urls(db, 'pku')).toEqual(beforePku);
    } finally {
      db.close();
    }
  }, 10000);
  it('父范围、URL与任务键都按站隔离，另一站的父目录不能授权当前站请求', async () => {
    const db = indexFixture();
    try {
      await publish(db, 'pku');
      const s = source('tsinghua'),
        pku = task('pku'),
        tuna = task('tsinghua');
      expect(installerTaskKey(pku)).not.toBe(installerTaskKey(tuna));
      await expect(
        executeInstallerJob(
          db,
          { ...tuna, depth: 1, directory: `${tuna.directory}v24.1.0/` },
          s.client,
          async () => {},
          rules,
        ),
      ).rejects.toThrow('父目录确认');
      await expect(
        executeInstallerJob(
          db,
          { ...tuna, directory: pku.directory },
          s.client,
          async () => {},
          rules,
        ),
      ).rejects.toThrow('允许范围');
      expect(s.fetchImpl).not.toHaveBeenCalled();
      expect(urls(db, 'tsinghua')).toEqual([]);
    } finally {
      db.close();
    }
  }, 10000);
});
