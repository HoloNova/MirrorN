// 显式、小范围后台验证：只取目录元数据，临时新库，不访问生产数据库/队列，不下载包体。
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openInstallerDatabase } from '../apps/server/src/db/database.js';
import { syncCatalog, searchResources } from '../apps/server/src/db/catalog.js';
import { loadCatalogData } from '../apps/server/src/db/loadData.js';
import { executeInstallerJob, type InstallerJob } from '../apps/server/src/indexing/installers.js';
import { SourceClient } from '../apps/server/src/indexing/source.js';
import { loadDownloadRules, defaultRuleDataDir } from '../apps/server/src/indexing/rules/load.js';
const rules = loadDownloadRules();
const directory = await mkdtemp(join(tmpdir(), 'pku-rule-runtime-'));
const db = openInstallerDatabase(join(directory, 'catalog.sqlite'));
const source = new SourceClient(undefined, 20000, 1024 ** 2, 1024 ** 2);
const discovered: InstallerJob[] = [];
const results: unknown[] = [];
try {
  syncCatalog(db, { ...(await loadCatalogData(defaultRuleDataDir)), rules });
  await executeInstallerJob(
    db,
    { kind: 'refresh', ruleRevision: rules.revision },
    source,
    async (jobs) => {
      discovered.push(...jobs);
    },
    rules,
  );
  for (const id of [
    'pku-nodejs',
    'pku-miniconda',
    'pku-anaconda',
    'pku-r-windows',
    'pku-r-macos',
    'pku-tomcat',
    'pku-kafka',
    'pku-archlinux',
    'pku-mactex',
  ]) {
    let job = discovered.find((j) => j.kind === 'directory' && j.bindingId === id);
    for (let depth = 0; job && depth < 6; depth++) {
      if (source.requests >= 24 || source.bytes > 2 * 1024 ** 2)
        throw new Error('小范围验证达到请求/元数据预算');
      const next: InstallerJob[] = [];
      const result = await executeInstallerJob(
        db,
        job,
        source,
        async (jobs) => {
          next.push(...jobs);
        },
        rules,
      );
      results.push({ binding: id, job, result });
      if ('files' in result && result.files > 0) break;
      // 只验证一条已发现路径，不把其余历史/架构声明为已采集。
      if (id === 'pku-r-macos')
        next.sort(
          (a, b) =>
            Number(b.kind === 'directory' && /(?:arm64|\/base\/)/.test(b.directory)) -
            Number(a.kind === 'directory' && /(?:arm64|\/base\/)/.test(a.directory)),
        );
      job = next[0];
    }
  }
  const summary = searchResources(db, { downloadableOnly: true, limit: 200 }).map((r) => ({
    software: r.softwareId,
    files: r.artifactCount,
    platforms: r.platforms,
    latest: r.latestVersion,
  }));
  for (const id of ['nodejs', 'anaconda-installer', 'anaconda-distribution', 'r-cran'])
    if (!summary.some((row) => row.software === id && row.files > 0))
      throw new Error(`基础软件未产出下载：${id}`);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  console.log(
    JSON.stringify(
      {
        requests: source.requests,
        metadataBytes: source.bytes,
        downloadedPackageBodies: 0,
        databaseBytes: (await stat(join(directory, 'catalog.sqlite'))).size,
        ruleRevision: rules.revision,
        summary,
        paths: results,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
  await rm(directory, { recursive: true, force: true });
}
