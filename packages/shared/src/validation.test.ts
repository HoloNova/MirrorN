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

  describe('probe targets', () => {
    function makeProbeMirror(overrides: Record<string, unknown>) {
      return MirrorSchema.parse({
        id: 'example-mirror',
        name: 'Probe Mirror',
        kind: 'community',
        homepageUrl: 'https://example.com/',
        aliases: ['probe'],
        probe: {
          id: 'example-robots',
          url: 'https://example.com/robots.txt',
          mode: 'no-cors',
          method: 'get',
          cacheBust: false,
        },
        sources: [source],
        ...overrides,
      });
    }

    it('accepts a probe declared on the same site as the homepage', () => {
      const dataset = makeDataset({ mirrors: [makeProbeMirror({})] });

      expect(validateDataset(dataset)).toEqual([]);
    });

    it('reports duplicate probe ids across mirrors', () => {
      const dataset = makeDataset({
        mirrors: [
          makeProbeMirror({}),
          makeProbeMirror({ id: 'second-mirror', homepageUrl: 'https://registry.example.com/' }),
        ],
      });

      expect(validateDataset(dataset).map((issue) => issue.message)).toContain(
        '探针 ID 重复：example-robots',
      );
    });

    it('reports a probe that points at another site', () => {
      const dataset = makeDataset({
        mirrors: [
          makeProbeMirror({
            probe: {
              id: 'example-robots',
              url: 'https://third-party.invalid/robots.txt',
              mode: 'no-cors',
              method: 'get',
              cacheBust: false,
            },
          }),
        ],
      });

      expect(validateDataset(dataset).map((issue) => issue.message)).toContain(
        '探针地址必须是镜像主页的主机、同一站点，或该镜像在生态数据里已声明的仓库主机；当前为 third-party.invalid',
      );
    });

    it('accepts a probe on a sibling subdomain of the homepage', () => {
      const dataset = makeDataset({
        mirrors: [
          makeProbeMirror({
            homepageUrl: 'https://www.example.com/',
            probe: {
              id: 'example-robots',
              url: 'https://registry.example.com/-/ping',
              mode: 'cors',
              method: 'get',
              cacheBust: true,
            },
          }),
        ],
      });

      expect(validateDataset(dataset)).toEqual([]);
    });

    it('accepts a probe on a host declared as the mirror repository in an ecosystem', () => {
      // 与 npm 官方镜像同样的情况：主页在 example.org，仓库主机在 example.com。
      const dataset = makeDataset({
        mirrors: [
          makeProbeMirror({
            homepageUrl: 'https://www.example.org/',
            probe: {
              id: 'example-robots',
              url: 'https://example.com/robots.txt',
              mode: 'no-cors',
              method: 'get',
              cacheBust: true,
            },
          }),
        ],
      });

      expect(validateDataset(dataset)).toEqual([]);
    });

    it('does not treat a two-label public suffix as a shared domain', () => {
      const dataset = makeDataset({
        mirrors: [
          makeProbeMirror({
            homepageUrl: 'https://mirrors.tuna.tsinghua.edu.cn/',
            probe: {
              id: 'example-robots',
              url: 'https://mirrors.pku.edu.cn/robots.txt',
              mode: 'no-cors',
              method: 'get',
              cacheBust: false,
            },
          }),
        ],
      });

      expect(validateDataset(dataset).map((issue) => issue.message)).toContain(
        '探针地址必须是镜像主页的主机、同一站点，或该镜像在生态数据里已声明的仓库主机；当前为 mirrors.pku.edu.cn',
      );
    });
  });

  describe('status sources', () => {
    function makeStatusMirror(overrides: Record<string, unknown> = {}) {
      return MirrorSchema.parse({
        id: 'example-mirror',
        name: 'Status Mirror',
        kind: 'university',
        homepageUrl: 'https://example.com/',
        aliases: ['status'],
        statusSource: {
          kind: 'tunasync',
          url: 'https://example.com/static/tunasync.json',
        },
        sources: [source],
        ...overrides,
      });
    }

    function makeStatusSupport() {
      return makeEcosystem({
        supports: [
          {
            ecosystemId: 'example-ecosystem',
            mirrorId: 'example-mirror',
            repositoryUrl: 'https://example.com/registry/',
            statusJob: 'pypi',
            sources: [source],
          },
        ],
      });
    }

    it('accepts a status source on the mirror site with a matching job', () => {
      const dataset = makeDataset({
        mirrors: [makeStatusMirror()],
        ecosystems: [makeStatusSupport()],
      });

      expect(validateDataset(dataset)).toEqual([]);
    });

    it('reports a status file hosted on another site', () => {
      const dataset = makeDataset({
        mirrors: [
          makeStatusMirror({
            statusSource: { kind: 'tunasync', url: 'https://elsewhere.example/tunasync.json' },
          }),
        ],
      });

      expect(validateDataset(dataset).map((issue) => issue.message)).toContain(
        '状态文件必须是镜像自己站点上的地址；当前为 elsewhere.example，主页为 example.com',
      );
    });

    it('reports a job declared without a status source on the mirror', () => {
      const dataset = makeDataset({
        mirrors: [
          MirrorSchema.parse({
            id: 'example-mirror',
            name: 'No Status Mirror',
            kind: 'community',
            homepageUrl: 'https://example.com/',
            aliases: ['no-status'],
            sources: [source],
          }),
        ],
        ecosystems: [makeStatusSupport()],
      });

      expect(validateDataset(dataset).map((issue) => issue.message)).toContain(
        '镜像 example-mirror 没有声明 statusSource，不能指定 statusJob',
      );
    });

    it('reports the same upstream job claimed twice', () => {
      const ecosystem = makeEcosystem({
        supports: [
          {
            ecosystemId: 'example-ecosystem',
            mirrorId: 'example-mirror',
            repositoryUrl: 'https://example.com/registry/',
            statusJob: 'pypi',
            sources: [source],
          },
          {
            ecosystemId: 'example-ecosystem',
            mirrorId: 'example-mirror',
            repositoryUrl: 'https://example.com/registry-alt/',
            statusJob: 'pypi',
            sources: [source],
          },
        ],
      });
      const dataset = makeDataset({ mirrors: [makeStatusMirror()], ecosystems: [ecosystem] });

      expect(validateDataset(dataset).map((issue) => issue.message)).toContain(
        '同一个状态文件里的作业名 pypi 被 example-mirror/example-ecosystem 与 example-mirror/example-ecosystem 同时占用',
      );
    });
  });
});
