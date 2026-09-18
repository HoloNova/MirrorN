import { describe, expect, it } from 'vitest';

import { EcosystemSchema, MirrorSchema, validateDataset } from './index.js';
import type { Dataset } from './validation.js';

const source = {
  url: 'https://example.com/source',
  checkedAt: '2026-09-18',
};

const mirror = MirrorSchema.parse({
  id: 'example-mirror',
  name: 'Example Mirror',
  kind: 'community',
  homepageUrl: 'https://example.com/',
  aliases: ['example'],
  sources: [source],
});

const troubleshooting = {
  id: 'example-troubleshooting',
  ecosystemId: 'example-ecosystem',
  title: '示例排错',
  problem: '示例问题。',
  steps: [{ title: '示例步骤', content: '示例内容。' }],
  sources: [source],
};

function makeEcosystem(overrides: Record<string, unknown> = {}) {
  return EcosystemSchema.parse({
    id: 'example-ecosystem',
    name: 'Example',
    packageManager: 'example',
    description: '用于测试的生态。',
    prerequisites: ['已安装示例工具。'],
    aliases: ['example'],
    supports: [
      {
        ecosystemId: 'example-ecosystem',
        mirrorId: 'example-mirror',
        repositoryUrl: 'https://example.com/registry/',
        sources: [source],
      },
    ],
    guides: [
      {
        id: 'linux-bash',
        os: 'linux',
        shell: 'bash',
        variables: ['mirrorUrl', 'packageName'],
        temporary: {
          label: '临时配置',
          command: 'tool install --index {{mirrorUrl}} {{packageName}}',
        },
        verification: {
          command: 'tool config get index',
          expected: '输出应包含镜像地址。',
        },
        restore: {
          command: 'tool config unset index',
          expected: '输出应恢复官方默认配置。',
        },
        sources: [source],
      },
    ],
    sources: [source],
    ...overrides,
  });
}

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    mirrors: [mirror],
    ecosystems: [makeEcosystem()],
    troubleshooting: [troubleshooting],
    ...overrides,
  };
}

describe('validateDataset', () => {
  it('accepts a complete dataset with declared template variables', () => {
    expect(validateDataset(makeDataset())).toEqual([]);
  });

  it('reports dangling mirror references and duplicate IDs', () => {
    const dataset = makeDataset({
      mirrors: [mirror, mirror],
      ecosystems: [
        makeEcosystem({
          supports: [
            {
              ecosystemId: 'example-ecosystem',
              mirrorId: 'missing-mirror',
              repositoryUrl: 'https://example.com/registry/',
              sources: [source],
            },
          ],
        }),
      ],
    });

    expect(validateDataset(dataset).map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        '镜像 ID 重复：example-mirror',
        '引用了不存在的镜像：missing-mirror',
      ]),
    );
  });

  it('reports template variables that are not declared', () => {
    const dataset = makeDataset({
      ecosystems: [
        makeEcosystem({
          guides: [
            {
              id: 'linux-bash',
              os: 'linux',
              shell: 'bash',
              variables: [],
              temporary: {
                label: '临时配置',
                command: 'tool install --index {{notDeclared}}',
              },
              verification: { command: 'tool config get index', expected: '输出应包含镜像地址。' },
              restore: { command: 'tool config unset index', expected: '输出应恢复默认。' },
              sources: [source],
            },
          ],
        }),
      ],
    });

    expect(validateDataset(dataset).map((issue) => issue.message)).toContain(
      '使用了未知模板变量 {{notDeclared}}',
    );
  });

  it('reports troubleshooting entries that point at a missing ecosystem', () => {
    const dataset = makeDataset({
      troubleshooting: [{ ...troubleshooting, ecosystemId: 'missing-ecosystem' }],
    });

    expect(validateDataset(dataset).map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        '引用了不存在的生态：missing-ecosystem',
        '生态 example-ecosystem 没有对应的排错条目',
      ]),
    );
  });

  it('requires every ecosystem to have at least one troubleshooting entry', () => {
    const dataset = makeDataset({ troubleshooting: [] });

    expect(validateDataset(dataset).map((issue) => issue.message)).toContain(
      '生态 example-ecosystem 没有对应的排错条目',
    );
  });
});
