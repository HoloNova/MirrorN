import { QueueEvents } from 'bullmq';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { createIndexQueue, redisConnection, QUEUE_NAME } from './queue.js';
import { indexFixture, fixtureRun, fixtureDownload, nodeDirectory } from '../db/indexFixture.js';
import { queryFiles } from '../db/fileQueries.js';
import { beginRun, publishRun } from '../db/installers.js';
import type { InstallerJob } from './installers.js';
const redisUrl = process.env.MIRRORN_TEST_REDIS_URL;
const task: Extract<InstallerJob, { kind: 'directory' }> = {
  kind: 'directory',
  family: 'node',
  software: 'nodejs',
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
      const first = await queue.start();
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
      ).rejects.toThrow('其它站点');
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(1);
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
