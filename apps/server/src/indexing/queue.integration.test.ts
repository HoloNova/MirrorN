import { QueueEvents } from 'bullmq';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { createIndexQueue, redisConnection, QUEUE_NAME } from './queue.js';
import { aptScope, indexFixture, fixtureSnapshot, fixtureFile } from '../db/indexFixture.js';
import { queryFiles } from '../db/fileQueries.js';

const redisUrl = process.env.MIRRORN_TEST_REDIS_URL;
describe.runIf(Boolean(redisUrl))('真实Redis/BullMQ隔离验证', () => {
  it('即使数据库未过期，每次start都有新的刷新任务；持久队列有定时器', async () => {
    const db = indexFixture();
    fixtureSnapshot(db, 'fresh', [fixtureFile()]);
    const fetchImpl = (async () => Response.json([])) as typeof fetch;
    const events = new QueueEvents(QUEUE_NAME, { connection: redisConnection(redisUrl!) });
    await events.waitUntilReady();
    let queue = createIndexQueue(db, redisUrl!, () => {}, { fetchImpl });
    try {
      const first = await queue.start();
      expect(first?.id).toMatch(/^startup-/);
      await first!.waitUntilFinished(events, 10000);
      expect(await queue.queue.getJobSchedulers()).toHaveLength(1);
      const firstId = first!.id;
      await queue.close();
      queue = createIndexQueue(db, redisUrl!, () => {}, { fetchImpl });
      const second = await queue.start();
      expect(second?.id).not.toBe(firstId);
      await second!.waitUntilFinished(events, 10000);
      expect(queryFiles(db, { resource: 'pku:debian' }).items[0]?.packageName).toBe('hello');
    } finally {
      await queue.close();
      await events.close();
      db.close();
    }
  }, 30000);
  it('503由BullMQ退避重试，完整成功前旧快照持续可读', async () => {
    const db = indexFixture();
    fixtureSnapshot(db, 'old', [fixtureFile('old')]);
    const payload = gzipSync(
      'Package: hello\nVersion: 2.10-4\nArchitecture: amd64\nFilename: pool/hello.deb\nSize: 10\n\n',
    );
    let calls = 0;
    const events = new QueueEvents(QUEUE_NAME, { connection: redisConnection(redisUrl!) });
    await events.waitUntilReady();
    const queue = createIndexQueue(db, redisUrl!, () => {}, {
      retryDelayMs: 50,
      fetchImpl: (async (input) => {
        if (String(input) !== aptScope.indexUrl) return Response.json([]);
        calls++;
        if (calls === 1) {
          expect(queryFiles(db, { resource: 'pku:debian' }).items[0]?.packageName).toBe('old');
          return new Response('', { status: 503 });
        }
        return new Response(payload);
      }) as typeof fetch,
    });
    try {
      const job = await queue.queue.add(
        'apt-packages',
        { ...aptScope, kind: 'apt-packages' },
        { jobId: 'retry-test', attempts: 3, backoff: { type: 'source' }, removeOnComplete: false },
      );
      await job.waitUntilFinished(events, 15000);
      expect(calls).toBe(2);
      expect(queryFiles(db, { resource: 'pku:debian' }).items[0]?.version).toBe('2.10-4');
      await job.remove();
    } finally {
      await queue.close();
      await events.close();
      db.close();
    }
  }, 30000);
  it('批量包页先入队也不阻挡随后发现的普通索引，实际由BullMQ优先级排序', async () => {
    const db = indexFixture();
    const queue = createIndexQueue(db, redisUrl!, () => {}, {
      fetchImpl: (async () => Response.json([])) as typeof fetch,
    });
    try {
      await queue.worker.waitUntilReady();
      await queue.worker.pause();
      await expect(
        queue.enqueue([{ ...aptScope, resourceId: 'ustc:debian', kind: 'apt-packages' }]),
      ).rejects.toThrow('禁止入队');
      await queue.enqueue([
        {
          ...aptScope,
          kind: 'pypi-project',
          protocol: 'pypi',
          component: 'pending-project',
          indexUrl: 'https://mirrors.pku.edu.cn/pypi/web/simple/pending-project/',
        },
      ]);
      await queue.enqueue([{ ...aptScope, kind: 'apt-packages' }]);
      const pending = await queue.queue.getPrioritized(0, 100);
      expect(
        pending.some((job) => 'resourceId' in job.data && job.data.resourceId.startsWith('ustc:')),
      ).toBe(false);
      expect(
        pending
          .filter((job) => ['apt-packages', 'pypi-project'].includes(job.data.kind))
          .map((job) => job.data.kind),
      ).toEqual(['apt-packages', 'pypi-project']);
    } finally {
      await queue.close();
      db.close();
    }
  }, 30000);
  it('容量不足时保留待办和旧文件，不抓源站或耗尽重试', async () => {
    const db = indexFixture();
    fixtureSnapshot(db, 'capacity-old', [fixtureFile('old')]);
    let report!: () => void;
    const limited = new Promise<void>((resolve) => {
      report = resolve;
    });
    let calls = 0;
    const queue = createIndexQueue(
      db,
      redisUrl!,
      (value) => {
        if (value.includes('空间不足')) report();
      },
      {
        storagePath: tmpdir(),
        minFreeBytes: Number.MAX_SAFE_INTEGER,
        capacityWaitMs: 50,
        fetchImpl: (async () => {
          calls++;
          return Response.json([]);
        }) as typeof fetch,
      },
    );
    try {
      const job = await queue.queue.add(
        'apt-packages',
        { ...aptScope, kind: 'apt-packages' },
        { jobId: 'capacity-test', attempts: 3 },
      );
      await limited;
      expect(calls).toBe(0);
      expect(queryFiles(db, { resource: 'pku:debian' }).items[0]?.packageName).toBe('old');
      expect((await queue.queue.getJob(job.id!))?.attemptsMade).toBe(0);
    } finally {
      await queue.close();
      db.close();
    }
  }, 30000);
});
