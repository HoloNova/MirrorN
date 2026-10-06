// 非UI集成验证：临时Redis，仅监听回环，测试完成/中断均停止，不操作生产库。
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
const binary = process.env.MIRRORN_TEST_REDIS_BIN || 'redis-server';
const version = spawnSync(binary, ['--version'], { encoding: 'utf8' });
const match = /v=(\d+)\.(\d+)/.exec(version.stdout ?? '');
if (!match || Number(match[1]) < 6 || (Number(match[1]) === 6 && Number(match[2]) < 2))
  throw new Error('需要Redis >=6.2；可通过MIRRORN_TEST_REDIS_BIN指定临时二进制');
const directory = await mkdtemp(join(tmpdir(), 'mirrorn-redis-'));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const server = spawn(
  binary,
  [
    '--bind',
    '127.0.0.1',
    '--port',
    String(port),
    '--save',
    '',
    '--appendonly',
    'no',
    '--dir',
    directory,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let test;
let stopped = false;
const stop = () => {
  if (!stopped) {
    stopped = true;
    test?.kill('SIGTERM');
    server.kill('SIGTERM');
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('临时Redis未就绪')), 10000);
    timer.unref();
    server.stdout.on('data', (chunk) => {
      log += chunk;
      if (log.includes('Ready to accept connections')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.on('error', reject);
    server.on('exit', (code) => reject(new Error(`Redis提前退出${code}: ${log}`)));
  });
  test = spawn(
    'pnpm',
    [
      '--filter',
      '@mirrorn/server',
      'exec',
      'vitest',
      'run',
      'src/indexing/queue.integration.test.ts',
      '--pool=forks',
      '--maxWorkers=1',
      '--minWorkers=1',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, MIRRORN_TEST_REDIS_URL: `redis://127.0.0.1:${port}/0` },
    },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    test.on('exit', (code) => resolve(code ?? 1));
    test.on('error', reject);
  });
} finally {
  const exited =
    server.exitCode !== null
      ? Promise.resolve()
      : new Promise((resolve) => server.once('exit', resolve));
  stop();
  await exited;
  await rm(directory, { recursive: true, force: true });
}
