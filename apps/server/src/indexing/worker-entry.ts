import { parentPort, workerData } from 'node:worker_threads';
import { dirname } from 'node:path';
import { openInstallerDatabase } from '../db/database.js';
import { createIndexQueue } from './queue.js';
import { loadDownloadRules } from './rules/load.js';

const data = workerData as {
  databasePath: string;
  redisUrl: string;
  timeoutMs: number;
  dataDir: string;
};
try {
  const rules = loadDownloadRules(data.dataDir);
  const db = openInstallerDatabase(data.databasePath);
  const queue = createIndexQueue(
    db,
    data.redisUrl,
    (value) => parentPort?.postMessage({ type: 'log', value }),
    { rules, timeoutMs: data.timeoutMs, storagePath: dirname(data.databasePath) },
  );
  void queue
    .start()
    .catch((error) =>
      parentPort?.postMessage({ type: 'log', value: `后台启动等待队列恢复: ${String(error)}` }),
    );
  parentPort?.on('message', (message) => {
    if (message === 'stop')
      void queue.close().finally(() => {
        db.close();
        parentPort?.close();
      });
  });
} catch (error) {
  parentPort?.postMessage({
    type: 'log',
    value: `规则初始化失败，暂停采集，旧数据库查询继续：${String(error)}`,
  });
  parentPort?.close();
}
