import { expect, it } from 'vitest';
import { SourceClient } from './source.js';
import { executeInstallerJob, type InstallerJob } from './installers.js';
import { loadDownloadRules } from './rules/load.js';
import { indexFixture } from '../db/indexFixture.js';
import { queryFiles } from '../db/fileQueries.js';

it('同站异步请求并行完成，快任务先返回，各任务计数互不污染', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    await new Promise((resolve) => setTimeout(resolve, path.includes('slow') ? 50 : 5));
    return Response.json({ path });
  };
  const shared = new SourceClient(fetchImpl);
  const slow = shared.fork();
  const fast = shared.fork();
  const completed: string[] = [];
  await Promise.all([
    slow.json('https://mirrors.pku.edu.cn/slow/').then(() => completed.push('slow')),
    fast.json('https://mirrors.pku.edu.cn/fast/').then(() => completed.push('fast')),
  ]);
  expect(completed).toEqual(['fast', 'slow']);
  for (const client of [slow, fast]) {
    expect(client.requests).toBe(1);
    expect(client.bytes).toBe(
      Buffer.byteLength(JSON.stringify({ path: client === slow ? '/slow/' : '/fast/' })),
    );
  }
  expect(shared.requests).toBe(0);
});

it('子任务入队即被执行时，父目录已经提交，可直接发布下载', async () => {
  const db = indexFixture();
  const rules = loadDownloadRules();
  const root: InstallerJob = {
    kind: 'directory',
    bindingId: 'pku-nodejs',
    directory: 'https://mirrors.pku.edu.cn/nodejs-release/',
    epoch: 1,
    depth: 0,
    ruleRevision: rules.revision,
  };
  const fetchImpl: typeof fetch = async (input) =>
    Response.json(
      new URL(String(input)).pathname === '/files/nodejs-release/'
        ? [{ name: 'v24.1.0', type: 'directory' }]
        : [{ name: 'node-v24.1.0-x64.msi', type: 'other' }],
    );
  try {
    await executeInstallerJob(
      db,
      root,
      new SourceClient(fetchImpl),
      async (jobs) => {
        await Promise.all(
          jobs.map((job) =>
            executeInstallerJob(db, job, new SourceClient(fetchImpl), async () => {}, rules),
          ),
        );
      },
      rules,
    );
    expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(1);
    expect(
      db.prepare("SELECT COUNT(*) n FROM catalog_runs WHERE state='failed'").get(),
    ).toMatchObject({ n: 0 });
  } finally {
    db.close();
  }
});

it('同批次同URL响应复用，新一轮刷新仍重新联网', async () => {
  let calls = 0;
  const shared = new SourceClient(async () => {
    calls++;
    return Response.json({ value: calls });
  });
  const first = shared.fork('round-1');
  const sibling = shared.fork('round-1');
  const url = 'https://mirrors.pku.edu.cn/shared/';
  expect(await first.json(url)).toEqual({ value: 1 });
  expect(await sibling.json(url)).toEqual({ value: 1 });
  expect(first.requests).toBe(1);
  expect(sibling.requests).toBe(0);
  expect(sibling.reusedRequests).toBe(1);
  expect(await shared.fork('round-2').json(url)).toEqual({ value: 2 });
  expect(calls).toBe(2);
});
