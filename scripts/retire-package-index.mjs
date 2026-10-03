// 开发阶段抓取数据不备份。默认只读计划；新API可用且加--apply后退役旧库、旧队列、抓取备份。
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { readdir, rm } from 'node:fs/promises';

const [runtimeArg, stateArg, ...flags] = process.argv.slice(2);
if (!runtimeArg || !stateArg || flags.some((flag) => flag !== '--apply'))
  throw new Error(
    '用法：node scripts/retire-package-index.mjs <新API运行目录> <状态目录> [--apply]',
  );
const state = resolve(stateArg),
  old = join(state, 'mirrorn.sqlite');
const api = new URL(process.env.MIRRORN_API_CHECK_URL || 'http://127.0.0.1:8788');
if (!['localhost', '127.0.0.1', '[::1]'].includes(api.hostname))
  throw new Error('只允许核对本机生产API');
const response = await fetch(new URL('/api/resources?limit=1&downloadable=1', api), {
  signal: AbortSignal.timeout(10000),
});
const live = await response.json();
if (
  !response.ok ||
  !['installers-v2', 'download-rules-v3'].includes(live.catalog) ||
  !live.items?.length ||
  !live.items.some((item) => item.artifactCount > 0)
)
  throw new Error('新安装目录尚未切换并提供下载，拒绝退役旧库/队列');
const fresh = new DatabaseSync(join(state, 'mirrorn-installers.sqlite'), { readOnly: true });
try {
  if (fresh.prepare('SELECT COUNT(*) n FROM catalog_downloads').get().n === 0)
    throw new Error('本地新库为空');
  if (fresh.prepare('PRAGMA quick_check').get().quick_check !== 'ok')
    throw new Error('新库检查失败');
} finally {
  fresh.close();
}
const backups = (await readdir(state, { withFileTypes: true }))
  .filter(
    (entry) =>
      entry.isFile() &&
      /^mirrorn(?:-installers)?\.before-[\w.-]+\.sqlite(?:-(?:wal|shm))?$/.test(entry.name),
  )
  .map((entry) => join(state, entry.name));
const removeFiles = [
  old,
  `${old}-wal`,
  `${old}-shm`,
  join(state, 'pku-resources.json'),
  ...backups,
];
console.log(
  JSON.stringify(
    {
      ready: true,
      dryRun: !flags.includes('--apply'),
      backup: false,
      removeFiles,
      removeQueue: 'mirrorn-pku-index',
      preserveQueue: 'mirrorn-pku-installers-v2',
      preserveDatabase: join(state, 'mirrorn-installers.sqlite'),
    },
    null,
    2,
  ),
);
if (flags.includes('--apply')) {
  const require = createRequire(join(resolve(runtimeArg), 'package.json'));
  const { Queue } = require('bullmq');
  const url = new URL(process.env.MIRRORN_REDIS_URL || 'redis://127.0.0.1:6389/0');
  const queue = new Queue('mirrorn-pku-index', {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
      db: Number(url.pathname.slice(1) || 0),
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
      maxRetriesPerRequest: 1,
    },
  });
  queue.on('error', (error) => console.error(error.message));
  try {
    await queue.pause();
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
  }
  for (const file of removeFiles) await rm(file, { force: true });
  console.log(
    '旧包库/WAL/SHM、旧队列、旧目录缓存与抓取备份已清除；新库和新队列保留，未创建数据备份。',
  );
}
