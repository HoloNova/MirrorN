// 显式首批接入核查：只写临时库、有界读取目录，包体只读64KiB；不启动API/Redis。
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openInstallerDatabase } from '../apps/server/src/db/database.js';
import { loadCatalogData } from '../apps/server/src/db/loadData.js';
import { syncCatalog, searchResources } from '../apps/server/src/db/catalog.js';
import { queryFiles } from '../apps/server/src/db/fileQueries.js';
import { executeInstallerJob, type InstallerJob } from '../apps/server/src/indexing/installers.js';
import { loadDownloadRules, defaultRuleDataDir } from '../apps/server/src/indexing/rules/load.js';
import { resourceSite } from '../apps/server/src/indexing/policy.js';
import { SourceClient } from '../apps/server/src/indexing/source.js';

const site = process.argv[2] ?? 'tsinghua';
const origin = resourceSite(site).origin;
const rules = loadDownloadRules();
const scope = new Set(['nodejs', 'miniconda', 'anaconda', 'ubuntu']);
const bindings = rules.active.filter((b) => b.siteId === site && scope.has(b.ruleId));
if (bindings.length !== 4) throw new Error('该站没有四项已审核启用绑定，不能执行接入核查');
const directory = await mkdtemp(join(tmpdir(), 'mirrorn-multisite-'));
const db = openInstallerDatabase(join(directory, 'catalog.sqlite'));
const source = new SourceClient(undefined, 20000, 1024 ** 2, 2 * 1024 ** 2);
const results: unknown[] = [],
  packages: unknown[] = [];
try {
  syncCatalog(db, { ...(await loadCatalogData(defaultRuleDataDir)), rules });
  for (const binding of bindings) {
    const root: InstallerJob = {
      kind: 'directory',
      bindingId: binding.id,
      directory: `${origin}/${binding.rootPath}`,
      epoch: Date.now(),
      depth: 0,
      ruleRevision: rules.revision,
    };
    const next: InstallerJob[] = [];
    let result = await executeInstallerJob(
      db,
      root,
      source,
      async (jobs) => {
        next.push(...jobs);
      },
      rules,
    );
    results.push({ binding: binding.id, directory: root.directory, result });
    // 最多试最新三条已发现目录，避免beta无候选被误报为整个软件不可用；不遍历历史。
    if ('files' in result && result.files === 0) {
      for (const child of next.slice(0, 3)) {
        if (source.requests >= 12 || source.bytes >= 3 * 1024 ** 2)
          throw new Error('首批核查达到目录预算');
        result = await executeInstallerJob(db, child, source, async () => {}, rules);
        results.push({
          binding: binding.id,
          directory: child.kind === 'directory' ? child.directory : null,
          result,
        });
        if ('files' in result && result.files > 0) break;
      }
    }
  }
  const summary = searchResources(db, { siteId: site });
  const expected = ['nodejs', 'anaconda-installer', 'anaconda-distribution', 'ubuntu'];
  for (const software of expected) {
    const resource = summary.find((r) => r.softwareId === software);
    if (!resource || !resource.artifactCount)
      throw new Error(`首批软件没有真实目录下载：${software}`);
    const items = queryFiles(db, {
      resource: resource.id,
      platform: software === 'nodejs' ? 'windows' : 'linux',
      ...(resource.latestVersion ? { version: resource.latestVersion } : {}),
      limit: 20,
    }).items;
    const file = items.find((f) =>
      software === 'nodejs'
        ? f.format === 'msi'
        : software === 'ubuntu'
          ? f.format === 'iso'
          : f.format === 'sh',
    );
    if (!file) throw new Error(`最新已收录版本缺少核查文件：${software}`);
    const timer = AbortSignal.timeout(20000);
    const response = await fetch(file.url, {
      redirect: 'manual',
      signal: timer,
      headers: {
        range: 'bytes=0-65535',
        'user-agent': 'MirrorN software installer indexer; https://mirror.campuslink.vip',
      },
    });
    const reader = response.body?.getReader();
    try {
      if (
        response.status !== 206 ||
        new URL(response.url).origin !== origin ||
        !reader ||
        !/^bytes 0-65535\/\d+$/.test(response.headers.get('content-range') ?? '')
      )
        throw new Error(`有界包体核查未通过：${response.status} ${file.url}`);
      const parts: Uint8Array[] = [];
      let bytes = 0;
      while (bytes < 65536) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 65536) throw new Error('源站未按Range限制包体');
        parts.push(part.value);
      }
      const body = Buffer.concat(parts);
      const magic =
        file.format === 'iso'
          ? body.subarray(32769, 32774).toString()
          : body.subarray(0, 8).toString('hex');
      const valid =
        file.format === 'iso'
          ? magic === 'CD001'
          : file.format === 'msi'
            ? magic === 'd0cf11e0a1b11ae1'
            : file.format === 'sh'
              ? body.subarray(0, 9).toString().startsWith('#!/bin/sh')
              : false;
      if (bytes !== 65536 || !valid)
        throw new Error(`文件格式包头未通过：${file.filename} ${magic}`);
      packages.push({
        software,
        url: file.url,
        status: response.status,
        finalOrigin: new URL(response.url).origin,
        bytesRead: bytes,
        contentRange: response.headers.get('content-range'),
        magic,
        fullPackageDownloaded: false,
      });
    } finally {
      await reader?.cancel();
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  console.log(
    JSON.stringify(
      {
        site,
        checkedAt: new Date().toISOString(),
        ruleRevision: rules.revision,
        requests: source.requests,
        directoryBytes: source.bytes,
        summary: summary.map((r) => ({
          id: r.id,
          software: r.softwareId,
          files: r.artifactCount,
          latest: r.latestVersion,
          platforms: r.platforms,
        })),
        paths: results,
        packages,
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
