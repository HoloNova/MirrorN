import type { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { EcosystemTaxonomySchema, SiteResourceListSchema } from '@mirrorn/shared';
const taxonomy = EcosystemTaxonomySchema.parse(
  JSON.parse(
    readFileSync(new URL('../../../../data/ecosystem-taxonomy.json', import.meta.url), 'utf8'),
  ),
);
const resources = SiteResourceListSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../../../data/site-resources/pku.json', import.meta.url), 'utf8'),
  ),
);
const tsinghuaResources = SiteResourceListSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../../../data/site-resources/tsinghua.json', import.meta.url), 'utf8'),
  ),
);
import { openInstallerDatabase } from './database.js';
import { syncCatalog } from './catalog.js';
import {
  beginRun,
  publishRun,
  stageDownloads,
  registerSoftwareSite,
  type Download,
} from './installers.js';

export function indexFixture(path = ':memory:') {
  const db = openInstallerDatabase(path);
  syncCatalog(db, {
    mirrors: [
      {
        id: 'pku',
        name: '北京大学开源镜像站',
        kind: 'university',
        homepageUrl: 'https://mirrors.pku.edu.cn/',
        aliases: ['北大'],
        sources: [],
      },
      {
        id: 'tsinghua',
        name: '清华',
        kind: 'university',
        homepageUrl: 'https://mirrors.tuna.tsinghua.edu.cn/',
        aliases: ['TUNA'],
        sources: [],
      },
      {
        id: 'ustc',
        name: '中科大',
        kind: 'university',
        homepageUrl: 'https://mirrors.ustc.edu.cn/',
        aliases: [],
        sources: [],
      },
    ],
    taxonomy,
    siteResources: [resources, tsinghuaResources],
    tutorials: [],
  });
  return db;
}
export const nodeDirectory = 'https://mirrors.pku.edu.cn/nodejs-release/v24.1.0/';
export function fixtureDownload(filename = 'node-v24.1.0-x64.msi', version = 'v24.1.0'): Download {
  return {
    filename,
    version,
    url: `${nodeDirectory}${filename}`,
    size: 100,
    platform: 'windows',
    arch: 'x64',
    format: 'msi',
  };
}
export function fixtureRun(
  db: DatabaseSync,
  files: Download[] = [fixtureDownload()],
  epoch = Date.now(),
  directory = nodeDirectory,
  software = 'nodejs',
) {
  registerSoftwareSite(db, 'pku', software);
  const run = beginRun(db, 'pku', software, directory, epoch);
  stageDownloads(db, run, files);
  publishRun(db, run);
  return run;
}
