import { describe, expect, it } from 'vitest';
import { indexFixture } from './indexFixture.js';
import {
  beginRun,
  publishRun,
  stageDownloads,
  installCatalog,
  type Download,
} from './installers.js';

const origin = 'https://mirrors.tuna.tsinghua.edu.cn';
const file: Download = {
  filename: 'Miniconda3-latest-Linux-x86_64.sh',
  url: `${origin}/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh`,
  version: 'latest',
  platform: 'linux',
  arch: 'x64',
  format: 'sh',
};
function publish(
  db: ReturnType<typeof indexFixture>,
  kind: 'directory' | 'official',
  files: Download[],
  epoch: number,
) {
  const run = beginRun(
    db,
    'tsinghua',
    'anaconda-installer',
    kind === 'official' ? `${origin}/` : `${origin}/anaconda/miniconda/`,
    epoch,
    epoch,
    'test',
    kind,
  );
  stageDownloads(db, run, files);
  publishRun(db, run, epoch);
  return run;
}
function rows(db: ReturnType<typeof indexFixture>) {
  return db.prepare('SELECT url,size,metadata FROM catalog_downloads ORDER BY url').all();
}
const other: Download = {
  ...file,
  filename: 'Miniconda3-py313_25.1.1-1-Linux-x86_64.sh',
  url: `${origin}/anaconda/miniconda/Miniconda3-py313_25.1.1-1-Linux-x86_64.sh`,
  version: '25.1.1-1',
};

describe('同一直链的官方清单与目录来源独立更新', () => {
  it.each(['official-first', 'directory-first'])('去重且保留目录的大小和元数据：%s', (order) => {
    const db = indexFixture();
    try {
      const directoryFile = {
        ...file,
        size: 123456,
        metadata: { purpose: 'installer', directoryEvidence: true },
      };
      const officialFile = { ...file, metadata: { purpose: 'installer', source: 'tuna-isoinfo' } };
      if (order === 'official-first') {
        publish(db, 'official', [officialFile], 1);
        publish(db, 'directory', [directoryFile], 2);
      } else {
        publish(db, 'directory', [directoryFile], 1);
        publish(db, 'official', [officialFile], 2);
      }
      expect(rows(db)).toHaveLength(1);
      expect(rows(db)[0]).toMatchObject({ size: 123456 });
      expect(JSON.parse(String(rows(db)[0]!.metadata))).toMatchObject({ directoryEvidence: true });
      expect(db.prepare('SELECT COUNT(*) n FROM catalog_download_sources').get()).toMatchObject({
        n: 2,
      });
    } finally {
      db.close();
    }
  });
  it('官方精选清单换版本不会删掉目录仍有的文件', () => {
    const db = indexFixture();
    try {
      publish(db, 'directory', [file, other], 1);
      publish(db, 'official', [file], 2);
      publish(db, 'official', [other], 3);
      expect(rows(db).map((r) => r.url)).toEqual([file.url, other.url].sort());
      publish(db, 'directory', [other], 4);
      expect(rows(db).map((r) => r.url)).toEqual([other.url]);
    } finally {
      db.close();
    }
  });
  it('目录撤销重叠文件时，官方来源继续保留且主范围同步转移', () => {
    const db = indexFixture();
    try {
      publish(db, 'official', [file], 1);
      publish(db, 'directory', [file, other], 2);
      publish(db, 'directory', [other], 3);
      expect(rows(db)).toHaveLength(2);
      expect(
        db
          .prepare(
            'SELECT s.source_kind FROM catalog_downloads d JOIN catalog_scopes s ON s.id=d.scope_id WHERE d.url=?',
          )
          .get(file.url),
      ).toMatchObject({ source_kind: 'official' });
      publish(db, 'official', [other], 4);
      expect(rows(db)).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it('既有单来源数据库自动回填关联，重复初始化不重复下载或关联', () => {
    const db = indexFixture();
    try {
      publish(db, 'directory', [file], 1);
      db.exec(
        'DROP TABLE catalog_download_sources; ALTER TABLE catalog_scopes DROP COLUMN source_kind;',
      );
      installCatalog(db);
      installCatalog(db);
      expect(rows(db)).toHaveLength(1);
      expect(db.prepare('SELECT COUNT(*) n FROM catalog_download_sources').get()).toMatchObject({
        n: 1,
      });
      publish(db, 'official', [file], 2);
      expect(db.prepare('SELECT COUNT(*) n FROM catalog_download_sources').get()).toMatchObject({
        n: 2,
      });
    } finally {
      db.close();
    }
  });
  it('过时的官方任务和异常空结果不能覆盖已发布下载', () => {
    const db = indexFixture();
    try {
      publish(db, 'official', [file], 2);
      expect(() => publish(db, 'official', [other], 1)).toThrow('旧采集');
      expect(() => publish(db, 'official', [], 3)).toThrow('异常空');
      expect(rows(db).map((r) => r.url)).toEqual([file.url]);
    } finally {
      db.close();
    }
  });
});
