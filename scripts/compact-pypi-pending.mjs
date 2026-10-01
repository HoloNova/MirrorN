// 一次性升级恢复：仅在采集线程停止时运行。先持久化包入口，才移除膨胀的旧任务。
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(resolve('apps/server/package.json'));
const { Queue } = require('bullmq');
const [dbPath, redisUrl] = process.argv.slice(2);
if (!dbPath || !redisUrl)
  throw Error('usage: node scripts/compact-pypi-pending.mjs DB_PATH REDIS_URL');
const url = new URL(redisUrl);
if (url.hostname !== '127.0.0.1') throw Error('仅允许本机私有队列');
const queue = new Queue('mirrorn-pku-index', {
  connection: { host: url.hostname, port: Number(url.port || 6379), maxRetriesPerRequest: null },
});
const client = await queue.client;
const db = new DatabaseSync(dbPath);
db.exec(
  'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS discovered_projects(resource_id TEXT NOT NULL,name TEXT NOT NULL,index_url TEXT NOT NULL,PRIMARY KEY(resource_id,name));',
);
const insert = db.prepare(
  'INSERT INTO discovered_projects(resource_id,name,index_url) VALUES(?,?,?) ON CONFLICT(resource_id,name) DO UPDATE SET index_url=excluded.index_url',
);
const oldLimit = Number((await client.config('GET', 'maxmemory'))[1]);
let removed = 0;
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
try {
  // Lua移除也需要少量写入空间；只临时增加16MiB，结束恢复配置，不扩容常态队列。
  await client.config('SET', 'maxmemory', String(oldLimit + 16 * 1024 ** 2));
  let cursor = '0';
  do {
    const [next, keys] = await client.scan(cursor, 'MATCH', queue.toKey('*'), 'COUNT', 500);
    cursor = next;
    const jobs = keys.filter((key) => /[a-f0-9]{64}$/.test(key));
    if (!jobs.length) continue;
    const pipe = client.pipeline();
    for (const key of jobs) pipe.hget(key, 'data');
    const values = await pipe.exec();
    const batch = [];
    for (let i = 0; i < jobs.length; i++) {
      const value = values[i];
      if (value[0] || !value[1]) continue;
      const data = JSON.parse(value[1]);
      if (data.kind !== 'pypi-project' || data.resourceId !== 'pku:pypi') continue;
      const u = new URL(data.indexUrl);
      if (u.origin !== 'https://mirrors.pku.edu.cn' || !u.pathname.startsWith('/pypi/web/simple/'))
        throw Error('非法入口，停止而不移除该任务');
      const name = data.component;
      if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(name)) throw Error('包名无效');
      batch.push({ id: jobs[i].slice(queue.toKey('').length), name, url: u.href });
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of batch) insert.run('pku:pypi', row.name, row.url);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    for (let offset = 0; offset < batch.length; offset += 32) {
      await Promise.all(batch.slice(offset, offset + 32).map((row) => queue.remove(row.id)));
    }
    removed += batch.length;
    if (removed && removed % 10000 < 500) console.log('入口已持久化并压缩任务', removed);
  } while (cursor !== '0' && !stopping);
  console.log('完成', {
    removed,
    projects: db.prepare('SELECT COUNT(*) AS n FROM discovered_projects').get().n,
    remaining: await queue.getJobCounts('wait', 'prioritized', 'delayed', 'active'),
  });
} finally {
  await client.config('SET', 'maxmemory', String(oldLimit));
  db.close();
  await queue.close();
}
