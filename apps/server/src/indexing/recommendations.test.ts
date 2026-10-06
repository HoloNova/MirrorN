import { expect, it, vi } from 'vitest';
import { fixtureDownload, fixtureRun, indexFixture } from '../db/indexFixture.js';
import { queryFiles } from '../db/fileQueries.js';
import { applyVersionPolicy } from '../db/versionPolicy.js';
import { loadDownloadRules } from './rules/load.js';
import { selectRecommendedVersions } from './recommendations.js';
import { executeInstallerJob, type InstallerJob } from './installers.js';
import { SourceClient } from './source.js';

const rules = loadDownloadRules();
const now = Date.UTC(2026, 9, 6);

it('Node跨站共用偶数支线，每支线只取最新补丁，排除预览与到期支线，保留学校常用旧支线', () => {
  const selected = selectRecommendedVersions(
    rules,
    'nodejs',
    [
      '26.6.0',
      '26.5.0',
      '24.9.0',
      '24.8.0',
      '22.18.0',
      '22.17.0',
      '20.19.0',
      '25.1.0',
      '27.0.0-rc.1',
    ],
    now,
  );
  expect([...selected]).toEqual(['26.6.0', '24.9.0', '22.18.0']);
  expect([
    ...selectRecommendedVersions(
      rules,
      'nodejs',
      ['24.9.0', '22.18.0', '20.19.0', '16.20.2', '16.19.0'],
      now,
    ),
  ]).toEqual(['24.9.0', '22.18.0', '16.20.2']);
  expect([
    ...selectRecommendedVersions(
      rules,
      'nodejs',
      ['22.18.0', '24.9.0', '26.6.0'],
      Date.UTC(2027, 5, 1),
    ),
  ]).not.toContain('22.18.0');
  expect([
    ...selectRecommendedVersions(
      rules,
      'python',
      ['3.14.8', '3.14.7', '3.13.12', '3.12.10', '3.11.14', '3.10.18', '3.15.0rc1'],
      now,
    ),
  ]).toEqual(['3.14.8', '3.13.12', '3.12.10', '3.10.18']);
});

it('Ubuntu只保留最近两条LTS并加上学校仍在用的20.04，滚动发行只保留当前批次', () => {
  expect([
    ...selectRecommendedVersions(
      rules,
      'ubuntu',
      ['26.04.1', '26.04', '25.10', '24.04.5', '22.04.5', '20.04.6'],
      now,
    ),
  ]).toEqual(['26.04.1', '24.04.5', '20.04.6']);
  expect([
    ...selectRecommendedVersions(
      rules,
      'archlinux',
      ['2026.10.01', '2026.09.01', '2026.08.01'],
      now,
    ),
  ]).toEqual(['2026.10.01']);
  expect([
    ...selectRecommendedVersions(
      rules,
      'apache-maven',
      ['4.0.0-rc-7', '3.10.0-rc-1', '3.10.0', '3.9.16', '3.8.9'],
      now,
    ),
  ]).toEqual(['3.10.0', '3.9.16']);
});

it.each(['pku', 'tsinghua'] as const)(
  '源站%s在根目录就限版本，不派发所有历史目录',
  async (site) => {
    const db = indexFixture();
    const names = [
      'v26.6.0',
      'v26.5.0',
      'v24.9.0',
      'v24.8.0',
      'v22.18.0',
      'v22.17.0',
      'v20.19.0',
      'v27.0.0-rc.1',
      'archive',
    ];
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      site === 'pku'
        ? Response.json(names.map((name) => ({ name, type: 'directory' })))
        : new Response(
            `<html><title>Index of /nodejs-release/</title><table>${names.map((name) => `<tr><td class="link"><a href="${name}/">${name}/</a></td><td class="size">-</td></tr>`).join('')}</table></html>`,
            { headers: { 'content-type': 'text/html' } },
          ),
    );
    const jobs: InstallerJob[] = [];
    try {
      await executeInstallerJob(
        db,
        {
          kind: 'directory',
          bindingId: `${site}-nodejs`,
          directory: `https://${site === 'pku' ? 'mirrors.pku.edu.cn' : 'mirrors.tuna.tsinghua.edu.cn'}/nodejs-release/`,
          depth: 0,
          epoch: 1,
          ruleRevision: rules.revision,
        },
        new SourceClient(fetchImpl),
        async (next) => {
          jobs.push(...next);
        },
        rules,
      );
      expect(
        jobs.map((job) => ('directory' in job ? job.directory.split('/').at(-2) : '')),
      ).toEqual(['v26.6.0', 'v24.9.0', 'v22.18.0']);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
    }
  },
);

it('清华JSON按相同策略入库，而非把所有版本写入，archive里的新Anaconda仍保留', async () => {
  const db = indexFixture();
  const versions = ['3.14.8', '3.14.7', '3.13.12', '3.12.10', '3.11.14'];
  const raw = [
    {
      distro: 'Python',
      category: 'app',
      urls: versions.map((version) => ({
        name: `${version} (Windows, amd64)`,
        url: `/python/${version}/python-${version}-amd64.exe`,
      })),
    },
    {
      distro: 'Conda',
      category: 'app',
      urls: [
        {
          name: 'Anaconda3 2026.07-1 (Linux/x86_64, sh)',
          url: '/anaconda/archive/Anaconda3-2026.07-1-Linux-x86_64.sh',
        },
      ],
    },
  ];
  try {
    await executeInstallerJob(
      db,
      { kind: 'official', epoch: 1, ruleRevision: rules.revision },
      new SourceClient(async () => Response.json(raw)),
      async () => {},
      rules,
    );
    expect(
      new Set(
        queryFiles(db, { resource: 'tsinghua:python', limit: 20 }).items.map(
          (file) => file.version,
        ),
      ),
    ).toEqual(new Set(['3.14.8', '3.13.12', '3.12.10']));
    expect(queryFiles(db, { resource: 'tsinghua:anaconda-distribution' }).items).toHaveLength(1);
  } finally {
    db.close();
  }
});

it('旧数据库立即移除非推荐版本；正常网络失败不删除仍被推荐的直链', async () => {
  const db = indexFixture();
  const versions = ['24.1.0', '24.0.0', '22.18.0', '22.17.0', '20.19.0'];
  try {
    fixtureRun(
      db,
      versions.map((version) => ({ ...fixtureDownload(`node-v${version}-x64.msi`, version) })),
    );
    expect(applyVersionPolicy(db, rules, now)).toBe(3);
    const before = queryFiles(db, { resource: 'pku:nodejs-release', limit: 20 }).items;
    expect(new Set(before.map((file) => file.version))).toEqual(new Set(['24.1.0', '22.18.0']));
    await expect(
      executeInstallerJob(
        db,
        {
          kind: 'directory',
          bindingId: 'pku-nodejs',
          directory: 'https://mirrors.pku.edu.cn/nodejs-release/',
          depth: 0,
          epoch: 2,
          ruleRevision: rules.revision,
        },
        new SourceClient(async () => new Response('unavailable', { status: 503 })),
        async () => {},
        rules,
      ),
    ).rejects.toThrow();
    expect(
      queryFiles(db, { resource: 'pku:nodejs-release', limit: 20 }).items.map((file) => file.url),
    ).toEqual(before.map((file) => file.url));
  } finally {
    db.close();
  }
});
