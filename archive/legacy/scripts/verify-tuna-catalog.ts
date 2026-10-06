// 显式核对一次官方JSON到SQLite的完整链路；不启动API/Redis、不请求包体。
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openInstallerDatabase } from '../apps/server/src/db/database.js';
import { loadCatalogData } from '../apps/server/src/db/loadData.js';
import { syncCatalog, searchResources } from '../apps/server/src/db/catalog.js';
import { createApp } from '../apps/server/src/app.js';
import { loadDownloadRules, defaultRuleDataDir } from '../apps/server/src/indexing/rules/load.js';
import { executeInstallerJob } from '../apps/server/src/indexing/installers.js';
import { SourceClient } from '../apps/server/src/indexing/source.js';
import { parseTunaCatalog, TUNA_CATALOG_URL } from '../apps/server/src/indexing/tuna/catalog.js';

const rules = loadDownloadRules();
const directory = await mkdtemp(join(tmpdir(), 'mirrorn-tuna-catalog-'));
const db = openInstallerDatabase(join(directory, 'catalog.sqlite'));
const requests: string[] = [];
const responses: unknown[] = [];
const network: typeof fetch = async (input, init) => {
  requests.push(String(input));
  if (String(input) !== TUNA_CATALOG_URL) throw new Error('核查只能读取官方JSON，不取目录或包体');
  const response = await fetch(input, init);
  if (response.ok) responses.push(await response.clone().json());
  return response;
};
try {
  syncCatalog(db, { ...(await loadCatalogData(defaultRuleDataDir)), rules });
  const source = new SourceClient(network);
  const result = await executeInstallerJob(
    db,
    { kind: 'official', epoch: Date.now(), ruleRevision: rules.revision },
    source,
    async () => {
      throw new Error('官方导入不应派发逐文件任务');
    },
    rules,
  );
  const parsed = parseTunaCatalog(responses[0], rules);
  const resources = searchResources(db, { siteId: 'tsinghua', limit: 200 });
  for (const id of [
    'python',
    'git',
    'vscodium',
    'debian',
    'ubuntu',
    'obs',
    'anaconda-installer',
    'anaconda-distribution',
  ])
    if (!resources.some((r) => r.softwareId === id && r.artifactCount > 0))
      throw new Error(`缺少官方已知下载：${id}`);
  const count = (db.prepare('SELECT COUNT(*) n FROM catalog_downloads').get() as { n: number }).n;
  if (count !== parsed.downloads.length || requests.length !== 1)
    throw new Error('直链去重或单次请求保证失败');
  const app = createApp({ db });
  const siteResponse = await app.request('/api/catalog/sites/tsinghua');
  const site = await siteResponse.json();
  if (siteResponse.status !== 200 || site.total !== resources.length)
    throw new Error('统一站点API与入库结果不一致');
  const issueSummary = Object.fromEntries(
    [...new Set(parsed.issues.map((i) => i.reason))].map((reason) => [
      reason,
      parsed.issues.filter((i) => i.reason === reason).length,
    ]),
  );
  const report = {
    checkedAt: new Date().toISOString(),
    source: TUNA_CATALOG_URL,
    ruleRevision: rules.revision,
    requests: source.requests,
    bytes: source.bytes,
    result,
    issueSummary,
    pending: parsed.issues.filter((i) => i.decision === 'pending'),
    rejectedSamples: Object.fromEntries(
      [...new Set(parsed.issues.filter((i) => i.decision === 'rejected').map((i) => i.reason))].map(
        (reason) => [reason, parsed.issues.filter((i) => i.reason === reason).slice(0, 4)],
      ),
    ),
    software: resources.map((r) => ({
      id: r.softwareId,
      resource: r.id,
      kind: r.kind,
      ecosystem: r.ecosystemId,
      files: r.artifactCount,
      latest: r.latestVersion,
      platforms: r.platforms,
      entry: r.downloadEntry,
    })),
    api: { status: siteResponse.status, total: site.total },
    temporaryDatabaseRemovedOnExit: true,
  };
  const text = JSON.stringify(report, null, 2);
  const output = process.argv[2];
  if (output) await writeFile(output, `${text}\n`);
  console.log(
    JSON.stringify(
      {
        checkedAt: report.checkedAt,
        requests: report.requests,
        bytes: report.bytes,
        result,
        issueSummary,
        api: report.api,
        pending: report.pending,
        report: output ?? null,
        temporaryDatabaseRemovedOnExit: true,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
  await rm(directory, { recursive: true, force: true });
}
