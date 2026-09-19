import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';

import { createApp } from './app.js';
import { resolveServerEnv } from './config.js';
import { createStatusStore } from './state/statusStore.js';
import { loadStatusSources, type StatusSourceDefinition } from './upstream/statusSources.js';

const resolution = resolveServerEnv({ argv: process.argv.slice(2), env: process.env });

if (!resolution.ok) {
  console.error(resolution.message);
  process.exit(1);
}

const config = resolution.value;
const { port, portSource, host } = config;

// 数据目录默认从本文件位置推导（src 与 dist 深度一致）：apps/server/{src,dist}/index.js → <repo>/data
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const defaultDataDir = resolve(repoRoot, 'data');
const dataDir = config.dataDir ?? defaultDataDir;
// 快照目录同理相对仓库根解析（MIRRORN_SNAPSHOT_DIR 给绝对路径时直接用）。
const snapshotPath = resolve(repoRoot, config.snapshotDir, 'mirrors-status.json');

let sources: StatusSourceDefinition[] = [];
try {
  const loaded = await loadStatusSources({ dataDir });
  sources = loaded.sources;
  for (const diagnostic of loaded.diagnostics) {
    console.warn(`数据检查：${diagnostic}`);
  }
} catch (error) {
  // 数据读不了不该让服务起不来：没有状态源时接口返回“未知”，其余功能不受影响。
  console.error(
    `读取数据目录失败，本次不提供同步状态：${error instanceof Error ? error.message : String(error)}`,
  );
}

const statusStore = createStatusStore({
  sources,
  snapshotPath,
  intervalMs: config.syncIntervalMs,
  staleAfterMs: config.staleAfterMs,
  fetchTimeoutMs: config.fetchTimeoutMs,
  maxResponseBytes: config.maxResponseBytes,
  log: (message) => console.log(`同步：${message}`),
});

if (config.syncEnabled && sources.length > 0) {
  const snapshot = await statusStore.loadSnapshot();
  if (snapshot.loaded) {
    console.log('同步：已载入上次成功快照');
  } else {
    console.log(`同步：未载入快照（${snapshot.reason ?? '未知原因'}），先按未知展示并立即同步`);
  }
  // 不 await：启动同步不应该拖慢端口就绪。
  void statusStore.refresh();
  statusStore.start();
} else if (sources.length === 0) {
  console.log('同步：数据里没有声明状态源，接口将返回未知状态');
}

const app = createApp({
  status: statusStore,
  fingerprint: {
    trustProxy: config.trustProxy,
    ...(config.fingerprintSecret === undefined ? {} : { secret: config.fingerprintSecret }),
  },
  ...(config.staticDir === undefined ? {} : { staticDir: config.staticDir }),
});

const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`MirrorN server listening on http://${host}:${info.port} (port from ${portSource})`);
  if (config.staticDir !== undefined) {
    console.log(`  同时托管静态页面：${config.staticDir}`);
  }
});

// 端口被占用时不要抛裸栈：这几乎总是“上一次的 dev 进程还在”，需要的是一行能照着做的提示。
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      [
        `端口 ${port} 已被占用，后端无法启动。`,
        `查看占用者：Linux 用 ss -ltnp | grep ${port}，macOS 用 lsof -i :${port}。`,
        `先结束旧进程；或换端口启动：pnpm --filter @mirrorn/server dev -- --port 9000。`,
      ].join('\n'),
    );
    process.exit(1);
  }

  console.error(`后端启动失败：${error.message}`);
  process.exit(1);
});

function shutdown(signal: string): void {
  console.log(`收到 ${signal}，正在退出。`);
  statusStore.stop();
  server.close(() => process.exit(0));
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => shutdown(signal));
}
