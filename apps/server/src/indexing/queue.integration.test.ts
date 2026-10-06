import { QueueEvents } from 'bullmq';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { createIndexQueue, redisConnection, QUEUE_NAME } from './queue.js';
import { indexFixture, fixtureRun, fixtureDownload, nodeDirectory } from '../db/indexFixture.js';
import { queryFiles } from '../db/fileQueries.js';
import { beginRun, publishRun } from '../db/installers.js';
import { installerTaskKey, type InstallerJob } from './installers.js';
import { loadDownloadRules } from './rules/load.js';
const rules = loadDownloadRules();
const redisUrl = process.env.MIRRORN_TEST_REDIS_URL;
const task: Extract<InstallerJob, { kind: 'directory' }> = {
  kind: 'directory',
  bindingId: 'pku-nodejs',
  ruleRevision: rules.revision,
  directory: nodeDirectory,
  epoch: Date.now() + 1000,
  depth: 1,
};
function confirmParent(db: ReturnType<typeof indexFixture>, epoch: number) {
  publishRun(
    db,
    beginRun(db, 'pku', 'nodejs', 'https://mirrors.pku.edu.cn/nodejs-release/', epoch),
    Date.now(),
    [nodeDirectory],
  );
}
async function clean(queue: ReturnType<typeof createIndexQueue>) {
  await queue.worker.close();
  await queue.queue.obliterate({ force: true });
  await queue.close();
}
describe.runIf(Boolean(redisUrl))('真实Redis：安装软件队列', () => {
  it('每次启动强制刷新，有且只有一个定时器；队列与旧包任务隔离', async () => {
    const db = indexFixture();
    fixtureRun(db);
    const fetchImpl = (async (url) => {
      const path = new URL(String(url)).pathname;
      return Response.json(
        path === '/files/nodejs-release/'
          ? [{ name: 'v24.1.0', type: 'directory' }]
          : path === `/files/nodejs-release/v24.1.0/`
            ? [{ name: fixtureDownload().filename, type: 'other' }]
            : [{ name: 'README', type: 'other' }],
      );
    }) as typeof fetch;
    const events = new QueueEvents(QUEUE_NAME, { connection: redisConnection(redisUrl!) });
    await events.waitUntilReady();
    let queue = createIndexQueue(db, redisUrl!, () => {}, { fetchImpl, jobIntervalMs: 10 });
    try {
      // 暂停消费后核对入队结果，避免两次立即刷新被消费掉而掩盖重复启动。
      await queue.worker.pause();
      const first = await queue.start();
      const immediate = await queue.queue.getJobs(['prioritized']);
      expect(immediate.filter((job) => job.data.kind === 'refresh')).toHaveLength(1);
      const scheduled = await queue.queue.getJobSchedulers();
      expect(scheduled[0]?.next).toBeGreaterThan(Date.now() + 5 * 60 * 60 * 1000);
      queue.worker.resume();
      await first!.waitUntilFinished(events, 10000);
      expect(first!.id).toMatch(/^startup-/);
      expect(await queue.queue.getJobSchedulers()).toHaveLength(1);
      await queue.close();
      queue = createIndexQueue(db, redisUrl!, () => {}, { fetchImpl, jobIntervalMs: 10 });
      const second = await queue.start();
      await second!.waitUntilFinished(events, 10000);
      expect(second!.id).not.toBe(first!.id);
      expect(QUEUE_NAME).not.toBe('mirrorn-pku-index');
      await expect(
        queue.enqueue([{ ...task, directory: 'https://mirrors.ustc.edu.cn/nodejs/' }]),
      ).rejects.toThrow('当前站点绑定范围');
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(1);
    } finally {
      await clean(queue);
      await events.close();
      db.close();
    }
  }, 30000);
  it('双站任务真实并存并各自发布；第101个子目录不冒充最新优先项', async () => {
    const db = indexFixture();
    const epoch = Date.now() + 1;
    const pku = {
      ...task,
      epoch,
      depth: 0,
      directory: 'https://mirrors.pku.edu.cn/nodejs-release/',
    };
    const tuna = {
      ...pku,
      bindingId: 'tsinghua-nodejs',
      directory: 'https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/',
    };
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'mirrors.pku.edu.cn')
        return Response.json(
          url.pathname === '/files/nodejs-release/'
            ? [{ name: 'v24.1.0', type: 'directory' }]
            : [{ name: fixtureDownload().filename, type: 'other', size: 100 }],
        );
      const href = url.pathname === '/nodejs-release/' ? 'v24.1.0/' : fixtureDownload().filename;
      return new Response(
        `<html><title>Index of ${url.pathname}</title><table><tr><td><a href="${href}">${href}</a></td><td class="size">${href.endsWith('/') ? '-' : '30.5 MiB'}</td></tr></table></html>`,
        { headers: { 'content-type': 'text/html' } },
      );
    };
    const events = new QueueEvents(QUEUE_NAME, { connection: redisConnection(redisUrl!) });
    await events.waitUntilReady();
    const queue = createIndexQueue(db, redisUrl!, () => {}, { fetchImpl, jobIntervalMs: 10 });
    try {
      await queue.worker.pause();
      await queue.enqueue([pku, tuna]);
      const roots = await queue.queue.getJobs(['prioritized']);
      expect(roots.map((j) => j.id).sort()).toEqual(
        [installerTaskKey(pku), installerTaskKey(tuna)].sort(),
      );
      const history = Array.from({ length: 102 }, (_, index) => ({
        ...pku,
        depth: 1,
        directory: `${pku.directory}v99.${index}.0/`,
      }));
      await queue.enqueue(history);
      expect((await queue.queue.getJob(installerTaskKey(history[0]!)))?.priority).toBe(3);
      expect((await queue.queue.getJob(installerTaskKey(history[100]!)))?.priority).toBe(5);
      for (const job of history) await queue.queue.remove(installerTaskKey(job));
      // 正式策略立即删除已完成任务；先订阅父/子完成事件，不能消费后再查句柄。
      const remaining = new Set(
        [pku, tuna].flatMap((root) => [
          installerTaskKey(root),
          installerTaskKey({ ...root, depth: 1, directory: `${root.directory}v24.1.0/` }),
        ]),
      );
      let timer: ReturnType<typeof setTimeout>;
      let completed: (data: { jobId: string }) => void;
      let failed: (data: { jobId: string; failedReason: string }) => void;
      const finished = new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('双站父子任务未在10秒内全部发布')), 10000);
        completed = ({ jobId }) => {
          remaining.delete(jobId);
          if (remaining.size === 0) resolve();
        };
        failed = ({ jobId, failedReason }) => {
          if (remaining.has(jobId)) reject(new Error(`双站任务失败：${failedReason}`));
        };
        events.on('completed', completed);
        events.on('failed', failed);
      });
      try {
        queue.worker.resume();
        await finished;
      } finally {
        clearTimeout(timer!);
        events.off('completed', completed!);
        events.off('failed', failed!);
      }
      const a = queryFiles(db, { resource: 'pku:nodejs-release' }).items;
      const b = queryFiles(db, { resource: 'tsinghua:nodejs-release' }).items;
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
      expect(a[0]?.url).toBe(fixtureDownload().url);
      expect(b[0]?.url).toBe(
        fixtureDownload().url.replace('mirrors.pku.edu.cn', 'mirrors.tuna.tsinghua.edu.cn'),
      );
      expect(b[0]?.sizeEstimated).toBe(true);
    } finally {
      await clean(queue);
      await events.close();
      db.close();
    }
  }, 30000);
  it('503由BullMQ重试，完整成功前保旧，重试没有残留暂存文件', async () => {
    const db = indexFixture();
    fixtureRun(db);
    const epoch = Date.now() + 1;
    confirmParent(db, epoch);
    let calls = 0;
    const events = new QueueEvents(QUEUE_NAME, { connection: redisConnection(redisUrl!) });
    await events.waitUntilReady();
    const queue = createIndexQueue(db, redisUrl!, () => {}, {
      retryDelayMs: 10,
      jobIntervalMs: 10,
      fetchImpl: (async () => {
        calls++;
        if (calls === 1) {
          expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items[0]?.filename).toBe(
            fixtureDownload().filename,
          );
          return new Response('', { status: 503 });
        }
        return Response.json([{ name: 'node-v24.1.0-arm64.msi', type: 'other' }]);
      }) as typeof fetch,
    });
    try {
      const job = await queue.queue.add(
        'directory',
        { ...task, epoch },
        {
          jobId: 'retry',
          attempts: 3,
          backoff: { type: 'source' },
          removeOnComplete: false,
        },
      );
      await job.waitUntilFinished(events, 10000);
      expect(calls).toBe(2);
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items[0]?.filename).toBe(
        'node-v24.1.0-arm64.msi',
      );
      expect((db.prepare('SELECT COUNT(*) n FROM catalog_staged').get() as { n: number }).n).toBe(
        0,
      );
    } finally {
      await clean(queue);
      await events.close();
      db.close();
    }
  }, 20000);
  it('低磁盘时保留待办和旧数据，不抓源站、不消耗重试次数', async () => {
    const db = indexFixture();
    fixtureRun(db);
    const epoch = Date.now() + 1;
    confirmParent(db, epoch);
    let report!: () => void,
      calls = 0;
    const limited = new Promise<void>((resolve) => {
      report = resolve;
    });
    const queue = createIndexQueue(
      db,
      redisUrl!,
      (value) => {
        if (value.includes('空间不足')) report();
      },
      {
        storagePath: tmpdir(),
        minFreeBytes: Number.MAX_SAFE_INTEGER,
        capacityWaitMs: 100,
        fetchImpl: (async () => {
          calls++;
          return Response.json([]);
        }) as typeof fetch,
      },
    );
    try {
      const job = await queue.queue.add(
        'directory',
        { ...task, epoch },
        { jobId: 'capacity', attempts: 3 },
      );
      await limited;
      expect(calls).toBe(0);
      expect((await queue.queue.getJob(job.id!))?.attemptsMade).toBe(0);
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(1);
    } finally {
      await clean(queue);
      db.close();
    }
  }, 10000);
});
