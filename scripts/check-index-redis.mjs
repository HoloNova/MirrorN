// 部署前只检查Redis兼容性/持久化，不写业务数据、不创建采集任务。
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
const runtime = resolve(process.argv[2]);
const require = createRequire(join(runtime, 'package.json'));
const bullRequire = createRequire(require.resolve('bullmq'));
const Redis = bullRequire('ioredis');
const redis = new Redis(process.env.MIRRORN_REDIS_URL || 'redis://127.0.0.1:6389/0', {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
  connectTimeout: 5000,
});
redis.on('error', () => {});
try {
  await redis.connect();
  const info = await redis.info('server');
  const version = /redis_version:(\d+)\.(\d+)/.exec(info);
  if (!version || Number(version[1]) < 6 || (Number(version[1]) === 6 && Number(version[2]) < 2))
    throw new Error('BullMQ需要Redis>=6.2');
  const policy = await redis.config('GET', 'maxmemory-policy');
  const aof = await redis.config('GET', 'appendonly');
  if (policy[1] !== 'noeviction' || aof[1] !== 'yes')
    throw new Error('生产采集队列要求maxmemory-policy=noeviction和appendonly=yes');
  console.log('Redis版本、noeviction和AOF检查通过');
} finally {
  redis.disconnect();
}
