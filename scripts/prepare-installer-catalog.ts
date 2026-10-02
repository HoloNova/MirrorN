// 发布前由运维显式执行的后台采集准备；不启动API，不改旧mirrorn.sqlite，不导入旧包记录。
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openInstallerDatabase } from '../apps/server/src/db/database.js';
import { loadCatalogData } from '../apps/server/src/db/loadData.js';
import { syncCatalog, searchResources } from '../apps/server/src/db/catalog.js';
import { executeInstallerJob, type InstallerJob } from '../apps/server/src/indexing/installers.js';
import { SourceClient } from '../apps/server/src/indexing/source.js';
import { compareRepoVersions } from '../apps/server/src/indexing/versions.js';

const path = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !path.endsWith('/mirrorn-installers.sqlite'))
  throw new Error('必须显式提供新mirrorn-installers.sqlite路径，不允许指定旧库');
await mkdir(dirname(path), { recursive: true });
const db = openInstallerDatabase(path),
  source = new SourceClient();
const pending: InstallerJob[] = [];
try {
  syncCatalog(db, await loadCatalogData(fileURLToPath(new URL('../data/', import.meta.url))));
  await executeInstallerJob(db, { kind: 'refresh' }, source, async (jobs) => {
    pending.push(...jobs);
  });
  const node = pending.find((j) => j.kind === 'directory' && j.family === 'node')!;
  const versions: InstallerJob[] = [];
  await executeInstallerJob(db, node, source, async (jobs) => {
    versions.push(...jobs);
  });
  versions.sort((a, b) =>
    a.kind === 'directory' && b.kind === 'directory'
      ? compareRepoVersions(
          'nodejs-release',
          b.directory.split('/').at(-2)!,
          a.directory.split('/').at(-2)!,
        )
      : 0,
  );
  if (!versions.length) throw new Error('Node版本未能发现，拒绝切换');
  await executeInstallerJob(db, versions[0]!, source, async () => {});
  for (const job of pending.filter((j) => j.kind === 'directory' && j.family !== 'node')) {
    const children: InstallerJob[] = [];
    await executeInstallerJob(db, job, source, async (jobs) => {
      children.push(...jobs);
    });
    // R的架构/base目录一并准备；其它历史目录留给启动后的持久任务。
    for (const child of children.filter(
      (j) =>
        j.kind === 'directory' && j.family === 'r' && /(?:arm64|x86_64|\/base\/)/.test(j.directory),
    )) {
      const grandchildren: InstallerJob[] = [];
      await executeInstallerJob(db, child, source, async (jobs) => {
        grandchildren.push(...jobs);
      });
      for (const base of grandchildren.filter(
        (j) => j.kind === 'directory' && /\/base\/$/.test(j.directory),
      ))
        await executeInstallerJob(db, base, source, async () => {});
    }
  }
  const resources = searchResources(db);
  for (const software of ['nodejs', 'anaconda-installer', 'anaconda-distribution', 'r-cran'])
    if (!resources.some((r) => r.ecosystemId === software && r.artifactCount > 0))
      throw new Error(`${software}未准备好，保留原API，不得部署`);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  console.log(
    JSON.stringify(
      {
        database: path,
        ready: true,
        requests: source.requests,
        metadataBytes: source.bytes,
        resources: resources.map((r) => ({
          id: r.id,
          files: r.artifactCount,
          platforms: r.platforms,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
