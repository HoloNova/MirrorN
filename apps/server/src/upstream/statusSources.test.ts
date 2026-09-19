import { describe, expect, it } from 'vitest';

import { loadStatusSources } from './statusSources.js';

const mirrorsWithStatus = [
  {
    id: 'mirror-a',
    name: 'Mirror A',
    kind: 'university',
    homepageUrl: 'https://mirror.example/',
    aliases: ['a'],
    statusSource: { kind: 'tunasync', url: 'https://mirror.example/static/tunasync.json' },
    sources: [{ url: 'https://mirror.example/help', checkedAt: '2026-09-19' }],
  },
  {
    id: 'mirror-b',
    name: 'Mirror B',
    kind: 'community',
    homepageUrl: 'https://other.example/',
    aliases: ['b'],
    sources: [{ url: 'https://other.example/help', checkedAt: '2026-09-19' }],
  },
];

const pipEcosystem = {
  id: 'pip',
  name: 'Python / pip',
  packageManager: 'pip',
  description: '示例生态。',
  prerequisites: ['已安装 Python。'],
  aliases: ['pip'],
  supports: [
    {
      ecosystemId: 'pip',
      mirrorId: 'mirror-a',
      repositoryUrl: 'https://mirror.example/pypi/simple/',
      supportsPublish: false,
      statusJob: 'pypi',
      sources: [{ url: 'https://mirror.example/help', checkedAt: '2026-09-19' }],
    },
    {
      ecosystemId: 'pip',
      mirrorId: 'mirror-b',
      repositoryUrl: 'https://other.example/pypi/simple/',
      supportsPublish: false,
      statusJob: 'pypi',
      sources: [{ url: 'https://other.example/help', checkedAt: '2026-09-19' }],
    },
  ],
  guides: [
    {
      id: 'linux-bash',
      os: 'linux',
      shell: 'bash',
      variables: ['mirrorUrl'],
      temporary: { label: '临时', command: 'pip install -i {{mirrorUrl}} pkg' },
      verification: { command: 'pip config get global.index-url', expected: '输出镜像地址。' },
      restore: { command: 'pip config unset global.index-url', expected: '恢复默认。' },
      sources: [{ url: 'https://mirror.example/help', checkedAt: '2026-09-19' }],
    },
  ],
  sources: [{ url: 'https://mirror.example/help', checkedAt: '2026-09-19' }],
};

function fakeFs(files: Record<string, unknown>) {
  return {
    readFileImpl: async (path: string) => {
      const key = Object.keys(files).find((candidate) => path.endsWith(candidate));
      if (key === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return JSON.stringify(files[key]);
    },
    readDirImpl: async () =>
      Object.keys(files)
        .filter((name) => name.startsWith('ecosystems/'))
        .map((name) => name.replace('ecosystems/', '')),
  };
}

describe('loadStatusSources', () => {
  it('collects only jobs whose mirror declares a status source', async () => {
    const result = await loadStatusSources({
      dataDir: '/data',
      ...fakeFs({ 'mirrors.json': mirrorsWithStatus, 'ecosystems/pip.json': pipEcosystem }),
    });

    expect(result.sources).toEqual([
      {
        kind: 'tunasync',
        url: 'https://mirror.example/static/tunasync.json',
        jobs: [{ mirrorId: 'mirror-a', ecosystemId: 'pip', job: 'pypi' }],
      },
    ]);
    expect(result.diagnostics).toEqual([
      '生态 pip 的 mirror-b 声明了 statusJob 但镜像没有 statusSource，已忽略',
    ]);
  });

  it('returns an empty source list when nothing declares a status job', async () => {
    const withoutJob = {
      ...pipEcosystem,
      supports: pipEcosystem.supports.map((support) => ({
        ecosystemId: support.ecosystemId,
        mirrorId: support.mirrorId,
        repositoryUrl: support.repositoryUrl,
        supportsPublish: support.supportsPublish,
        sources: support.sources,
      })),
    };

    const result = await loadStatusSources({
      dataDir: '/data',
      ...fakeFs({ 'mirrors.json': mirrorsWithStatus, 'ecosystems/pip.json': withoutJob }),
    });

    expect(result).toEqual({ sources: [], diagnostics: [] });
  });

  it('rejects invalid data instead of sending unverified URLs upstream', async () => {
    const broken = [
      {
        ...mirrorsWithStatus[0],
        statusSource: { kind: 'tunasync', url: 'http://insecure.example/x.json' },
      },
    ];

    await expect(
      loadStatusSources({
        dataDir: '/data',
        ...fakeFs({ 'mirrors.json': broken, 'ecosystems/pip.json': pipEcosystem }),
      }),
    ).rejects.toThrow();
  });
});
