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
import { REFRESH_INTERVAL_MS, INDEX_CONCURRENCY, SOURCE_CONCURRENCY } from './policy.js';
import { IndexProgress } from './progress.js';
import { loadDownloadRules, type RuleSet } from './rules/load.js';
import { bindingDirectory } from './rules/templates.js';

// 多站任务隔离旧北大v3待办；有效下载保留，旧队列在新队列健康后显式退役。
export const QUEUE_NAME = 'mirrorn-download-rules-v4';
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
  const progress = new IndexProgress(db, rules, log);
  let restored: Promise<void> | undefined;
  const restoreProgress = () =>
    (restored ??= queue.getJobs(['waiting', 'prioritized', 'delayed', 'active']).then(
      (jobs) => progress.register(jobs.map((job) => job.data)),
      (error) => {
        restored = undefined;
        log(`恢复采集汇总待办失败：${String(error)}`);
        throw error;
      },
    ));
  const enqueue: InstallerEnqueue = async (jobs) => {
    for (const job of jobs) {
      if (!['refresh', 'inventory', 'directory', 'official'].includes(job.kind))
        throw new SourceError('旧包仓库任务已退出', false);
      if (job.kind === 'official' && !rules.officialCatalog)
        throw new SourceError('清华官方清单未启用，禁止入队', false);
      if (job.kind === 'directory') {
        const binding = rules.bindings.get(job.bindingId);
        if (!binding || rules.rules.get(binding.ruleId)?.status !== 'active')
          throw new SourceError('采集规则未启用，禁止入队', false);
        try {
          bindingDirectory(binding, job.directory);
        } catch {
          throw new SourceError('入队目录超出当前站点绑定范围', false);
        }
      }
    }
    progress.register(jobs);
    for (let start = 0; start < jobs.length; start += 100)
      await queue.addBulk(
        jobs.slice(start, start + 100).map((data, offset) => ({
          name: data.kind,
          data,
          opts: {
            ...JOB_OPTIONS,
            jobId: installerTaskKey(data),
            priority:
              data.kind === 'refresh'
                ? 1
                : data.kind === 'official'
                  ? 1
                  : data.kind === 'inventory'
                    ? 9
                    : data.depth === 0
                      ? 2
                      : // 每个父目录已按版本排序；最新两项先跑，历史项仍保持有界采集。
                        start + offset < 2
                        ? 3
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
      // 恢复Redis中跨重启的待办，不能把先完成的一个目录当成整个生态完成。
      await restoreProgress();
      progress.register([job.data]);
      const scope =
        'epoch' in job.data ? `${rules.revision}:${job.data.epoch}:${job.attemptsMade}` : undefined;
      const taskSource = source.fork(scope);
      let failure: string | undefined;
      let retrying = false;
      try {
        const result = await executeInstallerJob(db, job.data, taskSource, enqueue, rules);
        if (job.data.kind === 'refresh' && (result as { pruned?: number }).pruned)
          log(
            `启动刷新：按版本策略移除${(result as { pruned?: number }).pruned}条归档下载，仅保留推荐支线`,
          );
        return result;
      } catch (error) {
        failure = String(error);
        const terminal =
          (error instanceof SourceError && !error.retryable) ||
          error instanceof CatalogPublishError ||
          error instanceof SyntaxError;
        retrying = !terminal && job.attemptsMade + 1 < (job.opts.attempts ?? 1);
        if (terminal) throw new UnrecoverableError(failure);
        throw error;
      } finally {
        progress.finish(job.data, { error: failure, retrying });
      }
    },
    {
      connection,
      concurrency: INDEX_CONCURRENCY,
      ...(options.jobIntervalMs === undefined
        ? {}
        : { limiter: { max: INDEX_CONCURRENCY, duration: options.jobIntervalMs } }),
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
  worker.on('failed', (job, error) => {
    // 目录/清单失败由生态结束行汇总；派发失败没有生态归属，仍立即提示。
    if (!job || job.data.kind === 'refresh') log(`采集失败 ${job?.name}: ${error.message}`);
  });
  queue.on('error', (error) => log(`Redis队列暂不可用: ${error.message}`));
  let stopping = false;
  return {
    queue,
    worker,
    enqueue,
    async start() {
      await queue.waitUntilReady();
      if (stopping) return;
      log(
        `并行采集已启用：全局${INDEX_CONCURRENCY}任务，每站最多${SOURCE_CONCURRENCY}请求同时进行；按源站/生态完成后汇总，同批次同URL响应复用`,
      );
      const interval = options.intervalMs ?? REFRESH_INTERVAL_MS;
      // BullMQ首次创建every定时器默认立即执行；启动刷新另有任务，不能再触发第二轮。
      await queue.upsertJobScheduler(
        'sites-six-hour-rules',
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
