import { describe, expect, it } from 'vitest';

import { EcosystemSchema, MirrorSchema, type Ecosystem, type Mirror } from '@mirrorn/shared';

import { pickHomeMeasureTargets } from './measureTargets';

const source = { url: 'https://example.com/source', checkedAt: '2026-09-18' };

const mirror = (id: string, options: { probe?: boolean } = {}) =>
  MirrorSchema.parse({
    id,
    name: id,
    kind: 'community',
    homepageUrl: 'https://example.com/',
    aliases: [id],
    ...(options.probe === false
      ? {}
      : {
          probe: {
            id: `${id}-probe`,
            url: 'https://example.com/robots.txt',
            mode: 'cors',
          },
        }),
    sources: [source],
  });

const mirrors: Mirror[] = [
  mirror('shared'),
  mirror('single'),
  mirror('no-probe', { probe: false }),
  mirror('also-single'),
];

const ecosystem = (id: string, mirrorIds: string[]): Ecosystem =>
  EcosystemSchema.parse({
    id,
    name: id,
    packageManager: id,
    description: '示例。',
    prerequisites: ['示例。'],
    aliases: [id],
    supports: mirrorIds.map((mirrorId) => ({
      ecosystemId: id,
      mirrorId,
      repositoryUrl: 'https://example.com/repo/',
      sources: [source],
    })),
    guides: [
      {
        id: `${id}-linux-bash`,
        os: 'linux',
        shell: 'bash',
        variables: ['mirrorUrl'],
        temporary: { label: '临时', command: 'echo {{mirrorUrl}}' },
        verification: { command: 'echo', expected: '有输出。' },
        restore: { command: 'echo', expected: '已还原。' },
        sources: [source],
      },
    ],
    sources: [source],
  });

const catalog = {
  mirrors,
  ecosystems: [
    ecosystem('a', ['shared', 'single']),
    ecosystem('b', ['shared', 'no-probe', 'also-single']),
  ],
  troubleshooting: [],
};

describe('pickHomeMeasureTargets', () => {
  it('只取声明了探针的来源', () => {
    const ids = pickHomeMeasureTargets(catalog).map((target) => target.mirrorId);

    expect(ids).not.toContain('no-probe');
  });

  it('被更多生态共用的来源排在前面，同分按 id 保证稳定', () => {
    const ids = pickHomeMeasureTargets(catalog).map((target) => target.mirrorId);

    expect(ids).toEqual(['shared', 'also-single', 'single']);
  });

  it('限制数量，避免首页一次并发探测太多站点', () => {
    expect(pickHomeMeasureTargets(catalog, 2).map((target) => target.mirrorId)).toEqual([
      'shared',
      'also-single',
    ]);
  });

  it('候选里带上探针定义，供测量直接使用', () => {
    const [first] = pickHomeMeasureTargets(catalog);

    expect(first.probe.id).toBe('shared-probe');
  });

  it('同一份数据每次都得到同一批候选', () => {
    expect(pickHomeMeasureTargets(catalog)).toEqual(pickHomeMeasureTargets(catalog));
  });
});
