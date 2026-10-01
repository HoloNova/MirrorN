// 临时运行已打包API，验证Redis失联时数据库查询仍正常；不调用源站、不操作生产服务。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const runtime = resolve(process.argv[2]);
const state = await mkdtemp(join(tmpdir(), 'mirrorn-api-smoke-'));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const processChild = spawn(process.execPath, [join(runtime, 'dist/server.js')], {
  cwd: runtime,
  env: {
    ...process.env,
    MIRRORN_HOST: '127.0.0.1',
    MIRRORN_PORT: String(port),
    MIRRORN_DATA_DIR: join(runtime, 'data'),
    MIRRORN_SNAPSHOT_DIR: state,
    MIRRORN_REDIS_URL: 'redis://mirrorn-redis-test.invalid:6379/0',
    MIRRORN_SYNC_ENABLED: 'false',
    MIRRORN_CRAWL_ENABLED: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
let stopped = false;
const stop = () => {
  if (!stopped) {
    stopped = true;
    processChild.kill('SIGTERM');
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API或队列失联验证未就绪: ' + log)), 20000);
    timer.unref();
    const collect = (chunk) => {
      log += chunk;
      if (log.includes('MirrorN server listening') && log.includes('ENOTFOUND')) {
        clearTimeout(timer);
        resolve();
      }
      if (log.includes('采集线程失败')) {
        clearTimeout(timer);
        reject(new Error(log));
      }
    };
    processChild.stdout.on('data', collect);
    processChild.stderr.on('data', collect);
    processChild.on('error', reject);
    processChild.on('exit', (code) => reject(new Error(`API提前退出${code}: ${log}`)));
  });
  // 仅在自己的临时库内模拟已有有效文件，证明失联不仅能查询身份资料。
  const fixtureDb = new DatabaseSync(join(state, 'mirrorn.sqlite'));
  const filename = 'node-v24.1.0-linux-x64.tar.xz';
  try {
    fixtureDb
      .prepare(
        'INSERT INTO artifacts(resource_id,version,platform,arch,format,filename,url,size,crawled_at) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .run(
        'pku:nodejs-release',
        'v24.1.0',
        'linux',
        'x64',
        'tar.xz',
        filename,
        `https://mirrors.pku.edu.cn/nodejs-release/v24.1.0/${filename}`,
        10,
        Date.now(),
      );
  } finally {
    fixtureDb.close();
  }
  const base = `http://127.0.0.1:${port}`;
  const oldFiles = await (await fetch(base + '/api/files?resource=pku%3Anodejs-release')).json();
  assert.equal(oldFiles.items.length, 1);
  assert.equal(oldFiles.items[0].filename, filename);
  assert.equal((await fetch(base + '/api/health')).status, 200);
  const resources = await (await fetch(base + '/api/resources')).json();
  assert.ok(resources.items.length > 0);
  assert.ok(resources.items.every((item) => item.siteId === 'pku'));
  assert.equal((await fetch(base + '/api/resources/pku%3Adebian/browse')).status, 410);
  assert.equal((await fetch(base + '/api/resources/ustc%3Adebian')).status, 404);
  assert.deepEqual(
    (await (await fetch(base + '/api/files?resource=pku%3Adebian')).json()).items,
    [],
  );
  const sites = await (await fetch(base + '/api/sites')).json();
  assert.ok(sites.items.some((site) => site.id === 'pku' && site.enabled));
  console.log('独立打包API/采集线程加载成功；Redis失联时数据库读取200，旧目录410，其它站资源404。');
} finally {
  const exited =
    processChild.exitCode !== null
      ? Promise.resolve()
      : new Promise((resolve) => processChild.once('exit', resolve));
  stop();
  await exited;
  await rm(state, { recursive: true, force: true });
}
