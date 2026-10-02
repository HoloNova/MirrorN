// 小范围真实后台采集验证：临时新库，只读取文件目录元数据，不请求安装包体或生产数据库。
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openInstallerDatabase } from '../apps/server/src/db/database.js';
import { syncCatalog, searchResources } from '../apps/server/src/db/catalog.js';
import { loadCatalogData } from '../apps/server/src/db/loadData.js';
import { executeInstallerJob, type InstallerJob } from '../apps/server/src/indexing/installers.js';
import { SourceClient } from '../apps/server/src/indexing/source.js';
import { compareRepoVersions } from '../apps/server/src/indexing/versions.js';

const directory = await mkdtemp(join(tmpdir(), 'pku-installers-'));
const db = openInstallerDatabase(join(directory, 'catalog.sqlite'));
const source = new SourceClient(undefined, 20000);
const discovered: InstallerJob[] = [];
try {
  const data = await loadCatalogData(fileURLToPath(new URL('../data/', import.meta.url)));
  syncCatalog(db, data);
  await executeInstallerJob(db, { kind: 'refresh' }, source, async (jobs) => {
    discovered.push(...jobs);
  });
  const root = discovered.find((job) => job.kind === 'directory' && job.software === 'nodejs')!;
  const versions: InstallerJob[] = [];
  await executeInstallerJob(db, root, source, async (jobs) => {
    versions.push(...jobs);
  });
  versions.sort((a, b) =>
    compareRepoVersions(
      'nodejs-release',
      'directory' in b ? b.directory.split('/').at(-2)! : '',
      'directory' in a ? a.directory.split('/').at(-2)! : '',
    ),
  );
  if (!versions.length) throw new Error('Node版本发现为空');
  await executeInstallerJob(db, versions[0]!, source, async () => {});
  for (const name of ['anaconda-installer', 'anaconda-distribution', 'r-cran']) {
    const job = discovered.find((j) => j.kind === 'directory' && j.software === name);
    if (!job) throw new Error(`软件入口缺失 ${name}`);
    await executeInstallerJob(db, job, source, async () => {});
  }
  const mac = discovered.find(
    (j) => j.kind === 'directory' && j.family === 'r' && j.directory.includes('/macosx/'),
  )!;
  let macJobs = [mac];
  for (let depth = 0; depth < 4 && macJobs.length; depth++) {
    const next: InstallerJob[] = [];
    const result = await executeInstallerJob(db, macJobs[0]!, source, async (jobs) => {
      next.push(...jobs);
    });
    console.log('macOS R目录验证', macJobs[0], result);
    if ('files' in result && result.files) break;
    macJobs = next.sort(
      (a, b) =>
        Number(b.kind === 'directory' && /arm64/.test(b.directory)) -
        Number(a.kind === 'directory' && /arm64/.test(a.directory)),
    );
  }
  // 单个明确的Apache发行目录只用于验证bin规则，不声称全项目/全历史覆盖。
  const projects: InstallerJob[] = [];
  await executeInstallerJob(
    db,
    discovered.find((j) => j.kind === 'apache')!,
    source,
    async (jobs) => {
      projects.push(...jobs);
    },
  );
  const maven = projects.find((job) => job.kind === 'directory' && job.software === 'apache-maven');
  if (maven) {
    let jobs = [maven];
    for (let depth = 0; depth < 8 && jobs.length; depth++) {
      const next: InstallerJob[] = [];
      const result = await executeInstallerJob(db, jobs[0]!, source, async (found) => {
        next.push(...found);
      });
      console.log('Apache目录验证', jobs[0], result);
      // 限定验证一条路径；不将其它未执行任务当成已采集范围。
      jobs = next.filter(
        (j) =>
          j.kind === 'directory' && /\/(?:maven-[34]|v?\d[\w.-]*|binaries)\/$/.test(j.directory),
      );
      jobs.sort((a, b) =>
        a.kind === 'directory' && b.kind === 'directory'
          ? compareRepoVersions('apache', b.directory, a.directory)
          : 0,
      );
    }
  }
  const summary = searchResources(db).map((r) => ({
    software: r.name,
    files: r.artifactCount,
    latest: r.latestVersion,
    platforms: r.platforms,
  }));
  if (summary.length < 4) throw new Error('已验证软件中有入口未产出安装文件');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  console.log(
    JSON.stringify(
      {
        requests: source.requests,
        metadataBytes: source.bytes,
        downloadedPackageBodies: 0,
        databaseBytes: (await stat(join(directory, 'catalog.sqlite'))).size,
        summary,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
  await rm(directory, { recursive: true, force: true });
}
