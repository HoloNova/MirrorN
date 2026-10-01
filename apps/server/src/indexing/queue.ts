import { randomUUID } from 'node:crypto';
import { statfsSync } from 'node:fs';
import {
  Queue,
  Worker,
  UnrecoverableError,
  type ConnectionOptions,
  type JobsOptions,
} from 'bullmq';
import type { DatabaseSync } from 'node:sqlite';
import { executeIndexJob } from './adapters.js';
import { taskKey, type IndexJob, type Enqueue } from './jobs.js';
import { SourceClient, SourceError } from './source.js';
import { REFRESH_INTERVAL_MS } from './policy.js';
import { collectOldSnapshots, SnapshotPublishError } from '../db/snapshots.js';

export const QUEUE_NAME = 'mirrorn-pku-index';
const JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'source' },
  priority: 10,
  removeOnComplete: true,
  removeOnFail: true,
};
export function redisConnection(value: string): ConnectionOptions {
  const url = new URL(value);
  if (!['redis:', 'rediss:'].includes(url.protocol))
    throw new Error('MIRRORN_REDIS_URL必须是redis地址');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

/** 生命周期由后台线程持有。API不持有Queue，因此读取不能入队。 */
export function createIndexQueue(
  db: DatabaseSync,
  redisUrl: string,
  log: (value: string) => void,
  options: {
    fetchImpl?: typeof fetch;
    intervalMs?: number;
    timeoutMs?: number;
    retryDelayMs?: number;
    storagePath?: string;
    minFreeBytes?: number;
    capacityWaitMs?: number;
  } = {},
) {
  const connection = redisConnection(redisUrl);
  const queue = new Queue<IndexJob>(QUEUE_NAME, { connection, defaultJobOptions: JOB_OPTIONS });
  const source = new SourceClient(options.fetchImpl, options.timeoutMs);
  const enqueue: Enqueue = async (tasks) => {
    if (tasks.some((task) => 'resourceId' in task && !task.resourceId.startsWith('pku:')))
      throw new SourceError('禁止入队未启用站点', false);
    // bulk每批500，任务ID按范围去重：重试目录发现不会重复，已有待办可跨轮继续。
    for (let i = 0; i < tasks.length; i += 500)
      await queue.addBulk(
        tasks.slice(i, i + 500).map((data) => ({
          name: data.kind,
          data,
          opts: { ...JOB_OPTIONS, jobId: taskKey(data), priority: taskPriority(data) },
        })),
      );
  };
  const worker = new Worker<IndexJob>(
    QUEUE_NAME,
    async (job) => {
      // 资源不足时用BullMQ限流回到待办，不消耗重试次数，不截断或删数据。
      if (options.storagePath) {
        const disk = statfsSync(options.storagePath);
        if (disk.bavail * disk.bsize < (options.minFreeBytes ?? 2 * 1024 ** 3)) {
          log('磁盘可用空间不足2GiB，采集等待空间恢复；有效数据仍可查询');
          await worker.rateLimit(options.capacityWaitMs ?? 60000);
          throw Worker.RateLimitError();
        }
      }
      const started = Date.now();
      const requests = source.requests;
      const bytes = source.bytes;
      const resource = 'resourceId' in job.data ? job.data.resourceId : 'pku:catalog';
      const run = Number(
        db
          .prepare('INSERT INTO crawl_runs(resource_id,started_at) VALUES(?,?)')
          .run(resource, started).lastInsertRowid,
      );
      try {
        if (job.data.kind === 'refresh') collectOldSnapshots(db);
        const result = await executeIndexJob(
          db,
          job.data,
          `${job.id}-${job.timestamp}`,
          source,
          enqueue,
        );
        db.prepare(
          "UPDATE crawl_runs SET finished_at=?,ok=1,files_seen=?,result='complete',requests=?,network_bytes=? WHERE id=?",
        ).run(
          Date.now(),
          ('files' in result ? result.files : 0) ?? 0,
          source.requests - requests,
          source.bytes - bytes,
          run,
        );
        return result;
      } catch (error) {
        db.prepare(
          "UPDATE crawl_runs SET finished_at=?,ok=0,error=?,result='failed',requests=?,network_bytes=? WHERE id=?",
        ).run(
          Date.now(),
          String(error).slice(0, 2000),
          source.requests - requests,
          source.bytes - bytes,
          run,
        );
        if (
          (error instanceof SourceError && !error.retryable) ||
          error instanceof SyntaxError ||
          error instanceof SnapshotPublishError
        )
          throw new UnrecoverableError(String(error));
        throw error;
      } finally {
        log(
          `${job.name} ${resource}: ${source.requests - requests}请求/${source.bytes - bytes}字节`,
        );
      }
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: 1000 },
      lockDuration: 120000,
      settings: {
        backoffStrategy: (attempts, _type, error) =>
          Math.max(
            (options.retryDelayMs ?? 30000) * 2 ** (attempts - 1),
            error instanceof SourceError ? error.retryAfterMs : 0,
          ),
      },
    },
  );
  worker.on('error', (error) => log(`采集队列暂不可用: ${error.message}`));
  worker.on('failed', (job, error) => log(`采集失败 ${job?.name}: ${error.message}`));
  queue.on('error', (error) => log(`Redis队列暂不可用: ${error.message}`));
  let stopping = false;
  return {
    queue,
    worker,
    enqueue,
    async start() {
      await queue.waitUntilReady();
      if (stopping) return;
      await queue.upsertJobScheduler(
        'pku-six-hour-refresh',
        { every: options.intervalMs ?? REFRESH_INTERVAL_MS },
        { name: 'refresh', data: { kind: 'refresh' }, opts: { ...JOB_OPTIONS, priority: 1 } },
      );
      // 每次进程启动一个独立刷新，不检查数据库或缓存年龄，也不沿用上次完成的启动ID。
      const startup = await queue.add(
        'refresh',
        { kind: 'refresh' },
        { ...JOB_OPTIONS, jobId: `startup-${randomUUID()}`, priority: 1 },
      );
      collectOldSnapshots(db);
      return startup;
    },
    async close() {
      stopping = true;
      await worker.close();
      await queue.close();
    },
  };
}

/** 大型项目清单不能让普通仓库的发现/刷新排在几十万包页之后。仍由BullMQ调度。 */
function taskPriority(task: IndexJob): number {
  if (task.kind === 'refresh') return 1;
  if (task.kind === 'catalog') return 2;
  if (['directory', 'pypi-root', 'apt-release', 'rpm-repomd', 'julia-root'].includes(task.kind))
    return 5;
  return task.kind === 'pypi-project' ? 20 : 10;
}
