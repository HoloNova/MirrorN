import { describe, it, expect } from 'vitest';
import { indexFixture, fixtureRun, fixtureDownload, nodeDirectory } from '../db/indexFixture.js';
import {
  executeInstallerJob,
  recognizeInstaller,
  installerTaskKey,
  type InstallerJob,
} from './installers.js';
import { SourceClient } from './source.js';
import { queryFiles } from '../db/fileQueries.js';
import { beginRun, publishRun } from '../db/installers.js';
import { searchResources } from '../db/catalog.js';

const directory: InstallerJob = {
  kind: 'directory',
  software: 'nodejs',
  family: 'node',
  directory: nodeDirectory,
  epoch: Date.now(),
  depth: 1,
};
function confirmParent(db: ReturnType<typeof indexFixture>, epoch: number) {
  const run = beginRun(db, 'pku', 'nodejs', 'https://mirrors.pku.edu.cn/nodejs-release/', epoch);
  publishRun(db, run, Date.now(), [nodeDirectory]);
}
describe('软件用途识别，不以扩展名扫描整个包仓库', () => {
  it.each([
    ['node', 'node-v24.1.0-x64.msi', 'windows', 'v24.1.0'],
    ['node', 'node-v24.1.0.pkg', 'macos', 'v24.1.0'],
    ['node', 'node-v24.1.0-linux-arm64.tar.xz', 'linux', 'v24.1.0'],
    ['node', 'node-v24.1.0-win-x64.zip', 'windows', 'v24.1.0'],
    ['node', 'node-v24.1.0-darwin-arm64.tar.gz', 'macos', 'v24.1.0'],
    ['miniconda', 'Miniconda3-py312_24.11.1-0-Windows-x86_64.exe', 'windows', '24.11.1-0'],
    ['miniconda', 'Miniconda3-py310_24.11.1-0-Linux-aarch64.sh', 'linux', '24.11.1-0'],
    ['miniconda', 'Miniconda3-latest-MacOSX-arm64.pkg', 'macos', 'latest'],
    ['anaconda', 'Anaconda3-2025.06-0-Linux-x86_64.sh', 'linux', '2025.06-0'],
    ['r', 'R-4.5.1-win.exe', 'windows', '4.5.1'],
    ['r', 'R-4.5.1-arm64.pkg', 'macos', '4.5.1'],
    ['apache', 'apache-maven-3.9.9-bin.tar.gz', 'any', '3.9.9'],
    ['apache', 'apache-activemq-6.3.2-bin.zip', 'any', '6.3.2'],
  ] as const)('%s解析%s的系统和软件版本', (family, name, platform, version) => {
    expect(recognizeInstaller(family, name)).toMatchObject({ platform, version });
  });
  it.each([
    ['node', 'node-v24.1.0.tar.gz'],
    ['node', 'node-v24.1.0-headers.tar.gz'],
    ['node', 'node-v24.1.0-aix-ppc64.tar.gz'],
    ['node', 'node-v24.1.0-linux-x64.zip'],
    ['miniconda', 'dataset.tar.gz'],
    ['miniconda', 'numpy-1.0.tar.gz'],
    ['miniconda', 'Anaconda3-2025.06-0-Windows-x86_64.exe'],
    ['r', 'Rcpp_1.0.zip'],
    ['r', 'R-4.5.1.tar.gz'],
    ['apache', 'apache-maven-3.9.9-src.tar.gz'],
    ['apache', 'dataset-3.9.9.zip'],
    ['apache', 'apache-maven-3.9.9-bin.tar.gz.asc'],
  ] as const)('%s拒绝源码、包仓库文件和未知归档%s', (family, name) => {
    expect(recognizeInstaller(family, name)).toBeUndefined();
  });
});

describe('后台动态发现与入库', () => {
  it('同目录的新轮次可入队，不被较早未执行待办去重掉', () => {
    expect(installerTaskKey({ ...directory, epoch: 2 })).not.toBe(
      installerTaskKey({ ...directory, epoch: 1 }),
    );
    expect(installerTaskKey(directory)).toBe(installerTaskKey(directory));
  });
  it('读取文件名列表，other类型的安装包也收录；从不请求安装包体', async () => {
    const db = indexFixture(),
      requested: string[] = [];
    const source = new SourceClient((async (url) => {
      requested.push(String(url));
      return Response.json([
        { name: 'node-v24.1.0-linux-x64.tar.xz', type: 'other', size: 100 },
        { name: 'node-v24.1.0.pkg', type: 'other' },
        { name: 'node-v24.1.0-x64.msi', type: 'other' },
        { name: 'node-v24.1.0.tar.gz', type: 'other' },
        { name: 'SHASUMS256.txt', type: 'other' },
      ]);
    }) as typeof fetch);
    try {
      confirmParent(db, directory.epoch);
      const result = await executeInstallerJob(db, directory, source, async () => {});
      expect(result).toMatchObject({ files: 3 });
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(3);
      expect(requested).toEqual(['https://mirrors.pku.edu.cn/files/nodejs-release/v24.1.0/']);
    } finally {
      db.close();
    }
  });
  it('启动只发现软件目录，退出APT/RPM/PyPI/conda包库任务', async () => {
    const db = indexFixture(),
      tasks: InstallerJob[] = [];
    try {
      await executeInstallerJob(
        db,
        { kind: 'refresh' },
        new SourceClient((async () => {
          throw new Error('refresh不取包清单');
        }) as typeof fetch),
        async (jobs) => {
          tasks.push(...jobs);
        },
      );
      const paths = tasks.filter((j) => j.kind === 'directory').map((j) => j.directory);
      expect(paths).toContain('https://mirrors.pku.edu.cn/anaconda/miniconda/');
      expect(paths).toContain('https://mirrors.pku.edu.cn/anaconda/archive/');
      expect(paths.every((url) => !/\/(?:dists|pool|pypi|pkgs|cloud)\//.test(url))).toBe(true);
      expect(tasks.every((j) => ['directory', 'apache'].includes(j.kind))).toBe(true);
    } finally {
      db.close();
    }
  });
  it('从镜像目录发现所有版本，不把版本或下载URL写进配置', async () => {
    const db = indexFixture(),
      tasks: InstallerJob[] = [];
    try {
      await executeInstallerJob(
        db,
        { ...directory, directory: 'https://mirrors.pku.edu.cn/nodejs-release/', depth: 0 },
        new SourceClient((async () =>
          Response.json([
            { name: 'v24.1.0', type: 'directory' },
            { name: 'v22.0.0', type: 'directory' },
            { name: 'v26.12.3', type: 'directory' },
            { name: 'latest', type: 'directory' },
          ])) as typeof fetch),
        async (jobs) => {
          tasks.push(...jobs);
        },
      );
      expect(tasks.map((j) => (j.kind === 'directory' ? j.directory : ''))).toContain(
        'https://mirrors.pku.edu.cn/nodejs-release/v26.12.3/',
      );
      expect(tasks).toHaveLength(3);
    } finally {
      db.close();
    }
  });
  it('目录错误、超额、异常空和入队失败都保旧，失败暂存不保留一天', async () => {
    for (const mode of ['empty', 'html', 'oversize', 'enqueue'] as const) {
      const db = indexFixture();
      fixtureRun(db, [fixtureDownload()]);
      const epoch = Date.now() + 1000;
      confirmParent(db, epoch);
      const source = new SourceClient(
        (async () =>
          mode === 'empty'
            ? Response.json([])
            : mode === 'html'
              ? new Response('<html>')
              : Response.json([{ name: 'node-v24.1.0-arm64.msi', type: 'other' }])) as typeof fetch,
        1000,
        mode === 'oversize' ? 1 : 4096,
      );
      try {
        await expect(
          executeInstallerJob(db, { ...directory, epoch }, source, async () => {
            if (mode === 'enqueue') throw new Error('Redis失联');
          }),
        ).rejects.toThrow();
        expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items[0]?.filename).toBe(
          fixtureDownload().filename,
        );
        expect((db.prepare('SELECT COUNT(*) n FROM catalog_staged').get() as { n: number }).n).toBe(
          0,
        );
      } finally {
        db.close();
      }
    }
  });
  it('父目录入队部分失败时，已经排入的子目录不能绕过未发布清单入库', async () => {
    const db = indexFixture(),
      pending: InstallerJob[] = [];
    try {
      await expect(
        executeInstallerJob(
          db,
          { ...directory, directory: 'https://mirrors.pku.edu.cn/nodejs-release/', depth: 0 },
          new SourceClient((async () =>
            Response.json([{ name: 'v24.1.0', type: 'directory' }])) as typeof fetch),
          async (jobs) => {
            pending.push(...jobs);
            throw new Error('第二批入队失败');
          },
        ),
      ).rejects.toThrow('入队失败');
      const noNetwork = new SourceClient((async () => {
        throw new Error('不应联网');
      }) as typeof fetch);
      await expect(executeInstallerJob(db, pending[0]!, noNetwork, async () => {})).rejects.toThrow(
        '父目录确认',
      );
      expect(noNetwork.requests).toBe(0);
      expect(searchResources(db)).toHaveLength(0);
    } finally {
      db.close();
    }
  });
  it('目录只有未识别文本时，不能撤销原有子目录的有效文件', async () => {
    const db = indexFixture();
    try {
      fixtureRun(db, [fixtureDownload()]);
      const epoch = Date.now() + 1000;
      confirmParent(db, epoch);
      await expect(
        executeInstallerJob(
          db,
          {
            ...directory,
            epoch: epoch + 1,
            directory: 'https://mirrors.pku.edu.cn/nodejs-release/',
            depth: 0,
          },
          new SourceClient((async () =>
            Response.json([{ name: 'README', type: 'other' }])) as typeof fetch),
          async () => {},
        ),
      ).rejects.toThrow('没有可识别');
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it('Apache按项目拆分条目，不把不同软件的版本混成一组', async () => {
    const db = indexFixture(),
      tasks: InstallerJob[] = [];
    try {
      await executeInstallerJob(
        db,
        { kind: 'apache', epoch: 1 },
        new SourceClient((async () =>
          Response.json([
            { name: 'maven', type: 'directory' },
            { name: 'activemq', type: 'directory' },
          ])) as typeof fetch),
        async (jobs) => {
          tasks.push(...jobs);
        },
      );
      const job = tasks[0]!;
      await executeInstallerJob(
        db,
        job,
        new SourceClient((async () =>
          Response.json([
            { name: 'apache-maven-3.9.9-bin.tar.gz', type: 'other' },
            { name: 'maven-plugin-tools-3.12.0-bin.tar.gz', type: 'other' },
          ])) as typeof fetch),
        async () => {},
      );
      expect(searchResources(db, { query: 'maven 3.9.9' })[0]?.ecosystemId).toBe('apache-maven');
      expect(searchResources(db, { query: 'activemq 3.9.9' })).toHaveLength(0);
      expect(searchResources(db, { query: 'maven 3.12.0' })).toHaveLength(0);
    } finally {
      db.close();
    }
  });
});
