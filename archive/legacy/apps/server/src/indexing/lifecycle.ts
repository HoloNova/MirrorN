import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

/** 网络采集、解压及同步SQLite写入在独立线程；主线程只提供只读查询。 */
export function startIndexWorker(options: {
  databasePath: string;
  redisUrl: string;
  timeoutMs: number;
  dataDir: string;
  log: (value: string) => void;
}) {
  const bundled = fileURLToPath(import.meta.url).endsWith('/server.js');
  const target = new URL(bundled ? './index-worker.js' : './worker-entry.js', import.meta.url);
  let worker: Worker;
  if (import.meta.url.endsWith('.ts')) {
    target.pathname = target.pathname.replace(/\.js$/, '.ts');
    worker = new Worker(
      `import('tsx/esm/api').then(({tsImport})=>tsImport(${JSON.stringify(target.href)}, ${JSON.stringify(import.meta.url)}))`,
      { eval: true, workerData: optionsWithoutLog(options) },
    );
  } else worker = new Worker(target, { workerData: optionsWithoutLog(options) });
  worker.on('message', (message: { type: string; value: string }) => {
    if (message.type === 'log') options.log(message.value);
  });
  worker.on('error', (error) => options.log(`采集线程失败，数据库查询继续可用: ${error.message}`));
  let stopping = false;
  worker.on('exit', (code) => {
    if (!stopping && code !== 0)
      options.log(`采集线程退出(${code})，需要检查后台；不会由API临时抓取`);
  });
  return {
    async stop() {
      stopping = true;
      worker.postMessage('stop');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          void worker.terminate().then(() => resolve());
        }, 10000);
        worker.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}
function optionsWithoutLog({
  databasePath,
  redisUrl,
  timeoutMs,
  dataDir,
}: {
  databasePath: string;
  redisUrl: string;
  timeoutMs: number;
  dataDir: string;
}) {
  return { databasePath, redisUrl, timeoutMs, dataDir };
}
