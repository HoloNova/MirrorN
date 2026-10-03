// 临时运行已打包API，验证Redis失联时数据库查询仍正常；不调用源站、不操作生产服务。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  const base = `http://127.0.0.1:${port}`;
  const legacy = new DatabaseSync(join(state, 'mirrorn.sqlite'));
  legacy.exec('CREATE TABLE old_marker(id INTEGER PRIMARY KEY)');
  legacy.close();
  const retire = () =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./retire-package-index.mjs', import.meta.url)), runtime, state],
      { env: { ...process.env, MIRRORN_API_CHECK_URL: base }, encoding: 'utf8', timeout: 15000 },
    );
  const emptyPlan = retire();
  assert.notEqual(emptyPlan.status, 0);
  assert.match(emptyPlan.stderr, /拒绝退役/);
  assert.ok(existsSync(join(state, 'mirrorn.sqlite')));
  // 仅在自己的临时库内模拟已有有效文件，证明失联不仅能查询身份资料。
  const fixtureDb = new DatabaseSync(join(state, 'mirrorn-installers.sqlite'));
  const filename = 'node-v24.1.0-linux-x64.tar.xz';
  try {
    const site = fixtureDb.prepare("SELECT id FROM catalog_sites WHERE slug='pku'").get().id;
    const software = fixtureDb
      .prepare("SELECT id FROM catalog_software WHERE slug='nodejs'")
      .get().id;
    const version = fixtureDb
      .prepare('INSERT INTO catalog_versions(software_id,version) VALUES(?,?)')
      .run(software, 'v24.1.0').lastInsertRowid;
    const scope = fixtureDb
      .prepare('INSERT INTO catalog_scopes(site_id,software_id,directory) VALUES(?,?,?)')
      .run(site, software, 'https://mirrors.pku.edu.cn/nodejs-release/v24.1.0/').lastInsertRowid;
    fixtureDb
      .prepare(
        `INSERT INTO catalog_downloads(version_id,site_id,scope_id,filename,url,platform,arch,format,size,seen_run,crawled_at)
      VALUES(?,?,?,?,?,'linux','x64','tar.xz',10,0,?)`,
      )
      .run(
        version,
        site,
        scope,
        filename,
        `https://mirrors.pku.edu.cn/nodejs-release/v24.1.0/${filename}`,
        Date.now(),
      );
  } finally {
    fixtureDb.close();
  }
  const plan = retire();
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).dryRun, true);
  assert.ok(existsSync(join(state, 'mirrorn.sqlite')));
  assert.ok(!existsSync(join(state, 'retired.sqlite')));
  const oldFiles = await (await fetch(base + '/api/files?resource=pku%3Anodejs-release')).json();
  assert.equal(oldFiles.items.length, 1);
  assert.equal(oldFiles.items[0].filename, filename);
  assert.equal((await fetch(base + '/api/health')).status, 200);
  const resources = await (await fetch(base + '/api/resources')).json();
  assert.equal(resources.catalog, 'download-rules-v3');
  assert.ok(resources.items.length > 0);
  assert.ok(resources.items.every((item) => item.siteId === 'pku'));
  assert.equal((await fetch(base + '/api/resources/pku%3Adebian/browse')).status, 410);
  assert.equal((await fetch(base + '/api/resources/ustc%3Adebian')).status, 404);
  // 软件身份不再因尚无下载而消失；空结果必须来自数据库，不能联网补齐。
  const debian = await fetch(base + '/api/resources/pku%3Adebian');
  assert.equal(debian.status, 200);
  assert.equal((await debian.json()).resource.artifactCount, 0);
  const emptyFiles = await fetch(base + '/api/files?resource=pku%3Adebian');
  assert.equal(emptyFiles.status, 200);
  assert.deepEqual((await emptyFiles.json()).items, []);
  const ecosystems = await (await fetch(base + '/api/ecosystems')).json();
  assert.ok(ecosystems.items.some((item) => item.id === 'debian'));
  assert.ok(ecosystems.items.length > 5);
  const sites = await (await fetch(base + '/api/sites')).json();
  assert.ok(sites.items.some((site) => site.id === 'pku' && site.enabled));
  console.log(
    `API/采集线程打包规则加载成功；数据库登记${ecosystems.items.length}个生态、${resources.items.length}个软件条目；Redis失联仍可查询已有文件，无下载身份保留且不联网；旧目录410，其它站404；退役dry-run不删除数据。`,
  );
} finally {
  const exited =
    processChild.exitCode !== null
      ? Promise.resolve()
      : new Promise((resolve) => processChild.once('exit', resolve));
  stop();
  await exited;
  await rm(state, { recursive: true, force: true });
}
