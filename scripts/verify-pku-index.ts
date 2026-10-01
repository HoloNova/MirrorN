// 小型真实元数据验证：临时库、只获取Release及一个contrib Packages索引，不下载包体。
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { openDatabase } from '../apps/server/src/db/database.js';
import { loadCatalogData } from '../apps/server/src/db/loadData.js';
import { syncCatalog } from '../apps/server/src/db/catalog.js';
import { queryFiles } from '../apps/server/src/db/fileQueries.js';
import { aptIndexes } from '../apps/server/src/indexing/parsers.js';
import { SourceClient } from '../apps/server/src/indexing/source.js';
import { executeIndexJob } from '../apps/server/src/indexing/adapters.js';
import { createApp } from '../apps/server/src/app.js';
const directory = await mkdtemp(join(tmpdir(), 'mirrorn-pku-index-'));
const db = openDatabase(join(directory, 'index.sqlite'));
try {
  syncCatalog(db, await loadCatalogData(resolve('data')));
  const source = new SourceClient(fetch, 30000, 4 * 1024 * 1024, 16 * 1024 * 1024);
  const releaseUrl = 'https://mirrors.pku.edu.cn/debian/dists/bookworm/Release';
  const release = await source.text(releaseUrl);
  const metadata = aptIndexes(release).find(
    (index) => index.component === 'contrib' && index.architecture === 'amd64',
  );
  if (!metadata) throw new Error('Release未提供contrib/amd64索引，不猜路径');
  await executeIndexJob(
    db,
    {
      kind: 'apt-packages',
      protocol: 'apt',
      resourceId: 'pku:debian',
      baseUrl: 'https://mirrors.pku.edu.cn/debian/',
      indexUrl: new URL(metadata.path, new URL('./', releaseUrl)).href,
      release: 'bookworm',
      component: 'contrib',
      architecture: 'amd64',
      expected: { size: metadata.size, sha256: metadata.sha256 },
    },
    'bounded-live-check',
    source,
    async () => {},
  );
  const page = queryFiles(db, { resource: 'pku:debian', limit: 200 });
  assert.ok(page.items.length > 0);
  assert.ok(
    page.items.every(
      (file) =>
        file.url.startsWith('https://mirrors.pku.edu.cn/debian/pool/') &&
        file.filename.endsWith('.deb'),
    ),
  );
  const requests = source.requests;
  const response = await createApp({ db }).request(
    'http://localhost/api/files?resource=pku%3Adebian&release=bookworm&arch=amd64',
  );
  assert.equal(response.status, 200);
  assert.equal(source.requests, requests);
  const count = db.prepare('SELECT COUNT(*) AS total FROM effective_files').get() as {
    total: number;
  };
  console.log(
    JSON.stringify({
      resource: 'pku:debian',
      range: 'bookworm/contrib/amd64',
      files: count.total,
      metadataRequests: source.requests,
      networkBytes: source.bytes,
      sample: page.items[0],
      databaseApi: response.status,
    }),
  );
} finally {
  db.close();
  await rm(directory, { recursive: true, force: true });
}
