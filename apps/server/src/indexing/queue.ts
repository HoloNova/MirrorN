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
import { CatalogPublishError, recoverRuns } from '../db/installers.js';
import {
  executeInstallerJob,
  installerTaskKey,
  type InstallerJob,
  type InstallerEnqueue,
} from './installers.js';
import { SourceClient, SourceError } from './source.js';
import { REFRESH_INTERVAL_MS } from './policy.js';
import { loadDownloadRules, type RuleSet } from './rules/load.js';

// 隔离旧的全仓库待办；升级不会重新执行APT/PyPI任务，旧队列由退役步骤显式清理。
export const QUEUE_NAME = 'mirrorn-pku-download-rules-v3';
const JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'source' },
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
    jobIntervalMs?: number;
    rules?: RuleSet;
  } = {},
) {
  const rules = options.rules ?? loadDownloadRules();
  recoverRuns(db);
  const connection = redisConnection(redisUrl);
  const queue = new Queue<InstallerJob>(QUEUE_NAME, { connection, defaultJobOptions: JOB_OPTIONS });
  // 仅软件目录元数据：不再允许48MB的包名索引/512MB的解压包索引。
  const source = new SourceClient(
    options.fetchImpl,
    options.timeoutMs,
    4 * 1024 ** 2,
    8 * 1024 ** 2,
  );
  const enqueue: InstallerEnqueue = async (jobs) => {
    for (const job of jobs) {
      if (!['refresh', 'inventory', 'directory'].includes(job.kind))
        throw new SourceError('旧包仓库任务已退出', false);
      if (job.kind === 'directory' && !job.directory.startsWith('https://mirrors.pku.edu.cn/'))
        throw new SourceError('禁止入队其它站点', false);
    }
    for (let start = 0; start < jobs.length; start += 100)
      await queue.addBulk(
        jobs.slice(start, start + 100).map((data) => ({
          name: data.kind,
          data,
          opts: {
            ...JOB_OPTIONS,
            jobId: installerTaskKey(data),
            priority:
              data.kind === 'refresh'
                ? 1
                : data.kind === 'inventory'
                  ? 9
                  : data.depth === 0
                    ? 2
                    : 5,
          },
        })),
      );
  };
  const worker = new Worker<InstallerJob>(
    QUEUE_NAME,
    async (job) => {
      if (options.storagePath) {
        const disk = statfsSync(options.storagePath);
        if (disk.bavail * disk.bsize < (options.minFreeBytes ?? 2 * 1024 ** 3)) {
          log('磁盘可用空间不足2GiB，采集等待空间恢复；有效数据仍可查询');
          await worker.rateLimit(options.capacityWaitMs ?? 60000);
          throw Worker.RateLimitError();
        }
      }
      const requests = source.requests,
        bytes = source.bytes;
      try {
        return await executeInstallerJob(db, job.data, source, enqueue, rules);
      } catch (error) {
        if (
          (error instanceof SourceError && !error.retryable) ||
          error instanceof CatalogPublishError ||
          error instanceof SyntaxError
        )
          throw new UnrecoverableError(String(error));
        throw error;
      } finally {
        log(
          `${job.name} ${'bindingId' in job.data ? job.data.bindingId : '软件发现'}: ${source.requests - requests}请求/${source.bytes - bytes}字节`,
        );
      }
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 1, duration: options.jobIntervalMs ?? 1000 },
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
      const interval = options.intervalMs ?? REFRESH_INTERVAL_MS;
      // BullMQ首次创建every定时器默认立即执行；启动刷新另有任务，不能再触发第二轮。
      await queue.upsertJobScheduler(
        'pku-six-hour-rules',
        { every: interval, startDate: Date.now() + interval },
        {
          name: 'refresh',
          data: { kind: 'refresh', ruleRevision: rules.revision },
          opts: { ...JOB_OPTIONS, priority: 1 },
        },
      );
      return queue.add(
        'refresh',
        { kind: 'refresh', ruleRevision: rules.revision },
        { ...JOB_OPTIONS, jobId: `startup-${randomUUID()}`, priority: 1 },
      );
    },
    async close() {
      stopping = true;
      await worker.close();
      await queue.close();
    },
  };
}
