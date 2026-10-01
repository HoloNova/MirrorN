import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './database.js';
import { syncCatalog } from './catalog.js';
import type { IndexedFile, ScopeSpec } from '../indexing/policy.js';
import { beginSnapshot, stageFiles, publishSnapshot } from './snapshots.js';

/** 仅测试使用的最小目录；文件记录不进入生产数据文件。 */
export function indexFixture(path = ':memory:') {
  const db = openDatabase(path);
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
        id: 'ustc',
        name: '中科大',
        kind: 'university',
        homepageUrl: 'https://mirrors.ustc.edu.cn/',
        aliases: [],
        sources: [],
      },
    ],
    taxonomy: [{ id: 'debian', label: 'Debian', category: 'distro', aliases: ['apt'] }],
    tutorials: [],
    siteResources: ['pku', 'ustc'].map((siteId) => ({
      siteId,
      checkedAt: '2026-09-29',
      resources: [
        {
          id: 'debian',
          name: 'Debian',
          ecosystemId: 'debian',
          kind: 'distro-repo',
          downloadEntry:
            siteId === 'pku'
              ? 'https://mirrors.pku.edu.cn/debian/'
              : 'https://mirrors.ustc.edu.cn/debian/',
          versionsHint: '',
          platforms: ['linux'],
          helpDocUrl: null,
          tutorialId: null,
          evidence: '',
          uncertain: null,
        },
      ],
    })),
  });
  return db;
}
export const aptScope: ScopeSpec = {
  resourceId: 'pku:debian',
  protocol: 'apt',
  indexUrl: 'https://mirrors.pku.edu.cn/debian/dists/bookworm/main/binary-amd64/Packages.gz',
  baseUrl: 'https://mirrors.pku.edu.cn/debian/',
  release: 'bookworm',
  component: 'main',
  architecture: 'amd64',
};
export function fixtureFile(name = 'hello', version = '2.10-3'): IndexedFile {
  const filename = `${name}_${version}_amd64.deb`;
  return {
    packageName: name,
    version,
    filename,
    url: `https://mirrors.pku.edu.cn/debian/pool/main/${filename}`,
    size: 100,
    role: 'package',
    platform: 'linux',
    arch: 'amd64',
    format: 'deb',
  };
}
export function fixtureSnapshot(
  db: DatabaseSync,
  identity: string,
  files: IndexedFile[],
  scope = aptScope,
  at = Date.now(),
) {
  const batch = beginSnapshot(db, scope, identity, at);
  stageFiles(db, batch.id, files);
  publishSnapshot(db, batch.id, 'test-digest', at);
  return batch;
}
