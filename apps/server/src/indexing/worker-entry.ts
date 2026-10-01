import { parentPort, workerData } from 'node:worker_threads';
import { dirname } from 'node:path';
import { openDatabase } from '../db/database.js';
import { createIndexQueue } from './queue.js';

const data = workerData as { databasePath: string; redisUrl: string; timeoutMs: number };
const db = openDatabase(data.databasePath);
const queue = createIndexQueue(
  db,
  data.redisUrl,
  (value) => parentPort?.postMessage({ type: 'log', value }),
  { timeoutMs: data.timeoutMs, storagePath: dirname(data.databasePath) },
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
