import { describe, expect, it } from 'vitest';

import { EcosystemSchema, MirrorSchema, type Ecosystem } from '../schemas.js';
import {
  PACKAGE_NAME_PLACEHOLDER,
  generateGuide,
  listPlatforms,
  type GuideResult,
} from './index.js';

const source = { url: 'https://example.com/source', checkedAt: '2026-09-18' };

const mirror = MirrorSchema.parse({
  id: 'example-mirror',
  name: 'Example Mirror',
  kind: 'community',
  homepageUrl: 'https://example.com/',
  aliases: ['example'],
  sources: [source],
});

const otherMirror = MirrorSchema.parse({
  id: 'other-mirror',
  name: 'Other Mirror',
  kind: 'commercial',
  homepageUrl: 'https://other.example.com/',
  aliases: ['other'],
  sources: [source],
});

const ecosystemFixture = {
  id: 'example',
  name: 'Example',
  packageManager: 'example',
  description: '用于测试的生态。',
  prerequisites: ['已安装 example 工具。'],
  aliases: ['example'],
  supports: [
    {
      ecosystemId: 'example',
      mirrorId: 'example-mirror',
      repositoryUrl: 'https://example.com/simple/',
      sources: [source],
    },
    {
      ecosystemId: 'example',
      mirrorId: 'other-mirror',
      repositoryUrl: 'https://other.example.com/simple/',
      sources: [source],
    },
  ],
  guides: [
    {
      id: 'windows-powershell',
      os: 'windows',
      shell: 'powershell',
      variables: ['mirrorUrl', 'packageName'],
      temporary: {
        label: '临时使用',
        command: 'tool install --index {{mirrorUrl}} {{packageName}}',
      },
      persistent: {
        label: '全局生效',
        command: 'tool config set index {{mirrorUrl}}',
      },
      configFile: {
        path: '%APPDATA%\\example\\example.ini',
        format: 'ini',
        content: '[global]\nindex = {{mirrorUrl}}\n',
        instructions: '已存在时只合并字段。',
        backup: '先备份原文件。',
      },
      verification: { command: 'tool config get index', expected: '输出应包含地址。' },
      restore: {
        command: 'tool config unset index',
        expected: '用户级配置被移除。',
        note: '不会恢复你原来的配置。',
      },
      sources: [source],
    },
    {
      id: 'linux-bash',
      os: 'linux',
      shell: 'bash',
      variables: ['mirrorUrl'],
      persistent: {
        label: '全局生效',
        command: 'tool config set index {{mirrorUrl}}',
      },
      verification: { command: 'tool config get index', expected: '输出应包含地址。' },
      restore: { command: 'tool config unset index', expected: '用户级配置被移除。' },
      sources: [source],
    },
  ],
  sources: [source],
};

function makeEcosystem(overrides: Record<string, unknown> = {}): Ecosystem {
  return EcosystemSchema.parse({ ...ecosystemFixture, ...overrides });
}

function expectSuccess(result: GuideResult) {
  if (!result.ok) {
    throw new Error(`预期生成成功，实际失败：${result.reason} ${result.message}`);
  }
  return result.guide;
}

describe('listPlatforms', () => {
  it('returns only the platforms that have templates, in a stable order', () => {
    expect(listPlatforms(makeEcosystem())).toEqual([
      { os: 'windows', shells: ['powershell'] },
      { os: 'linux', shells: ['bash'] },
    ]);
  });
});

describe('generateGuide', () => {
  it('renders real values from data instead of template placeholders', () => {
    const guide = expectSuccess(
      generateGuide({
        ecosystem: makeEcosystem(),
        mirror,
        os: 'windows',
        shell: 'powershell',
      }),
    );

    expect(guide.mirror.repositoryUrl).toBe('https://example.com/simple/');
    expect(guide.commands.map((command) => command.command)).toEqual([
      `tool install --index https://example.com/simple/ ${PACKAGE_NAME_PLACEHOLDER}`,
      'tool config set index https://example.com/simple/',
    ]);
    expect(guide.configFile?.content).toBe('[global]\nindex = https://example.com/simple/\n');
    expect(guide.configFile?.path).toBe('%APPDATA%\\example\\example.ini');
    expect(guide.verification.command).toBe('tool config get index');
    expect(guide.restore.note).toBe('不会恢复你原来的配置。');
    expect(guide.prerequisites).toEqual(['已安装 example 工具。']);
  });

  it('keeps the placeholder list in sync with what the commands actually contain', () => {
    const windows = expectSuccess(
      generateGuide({ ecosystem: makeEcosystem(), mirror, os: 'windows', shell: 'powershell' }),
    );
    const linux = expectSuccess(
      generateGuide({ ecosystem: makeEcosystem(), mirror, os: 'linux', shell: 'bash' }),
    );

    expect(windows.placeholders).toEqual([PACKAGE_NAME_PLACEHOLDER]);
    expect(linux.placeholders).toEqual([]);
  });

  it('produces different commands for a different mirror', () => {
    const guide = expectSuccess(
      generateGuide({
        ecosystem: makeEcosystem(),
        mirror: otherMirror,
        os: 'linux',
        shell: 'bash',
      }),
    );

    expect(guide.commands[0].command).toBe(
      'tool config set index https://other.example.com/simple/',
    );
    expect(guide.mirror.id).toBe('other-mirror');
  });

  it('rejects a mirror that does not serve the ecosystem', () => {
    const unsupported = MirrorSchema.parse({
      id: 'unrelated-mirror',
      name: 'Unrelated Mirror',
      kind: 'university',
      homepageUrl: 'https://unrelated.example.com/',
      aliases: ['unrelated'],
      sources: [source],
    });

    const result = generateGuide({
      ecosystem: makeEcosystem(),
      mirror: unsupported,
      os: 'linux',
      shell: 'bash',
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unsupported-mirror');
  });

  it('explains which platforms exist when the selection has no template', () => {
    const result = generateGuide({
      ecosystem: makeEcosystem(),
      mirror,
      os: 'macos',
      shell: 'bash',
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unsupported-platform');
    expect(result.ok === false && result.message).toContain('Windows/PowerShell');
    expect(result.ok === false && result.message).toContain('Linux/Bash');
  });

  it('refuses to pick silently when several templates match the same platform', () => {
    const ecosystem = makeEcosystem({
      guides: [
        ecosystemFixture.guides[1],
        {
          ...ecosystemFixture.guides[1],
          id: 'linux-bash-2204',
          version: '22.04',
        },
      ],
    });

    const result = generateGuide({ ecosystem, mirror, os: 'linux', shell: 'bash' });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('ambiguous-platform');
  });

  it('reports a missing variable value instead of emitting a broken command', () => {
    const ecosystem = makeEcosystem({
      guides: [
        {
          id: 'linux-bash',
          os: 'linux',
          shell: 'bash',
          // configPath 没有对应模板值，声明后必须被显式提供
          variables: ['configPath'],
          persistent: { label: '全局生效', command: 'tool config set path {{configPath}}' },
          verification: { command: 'tool config get path', expected: '输出应包含路径。' },
          restore: { command: 'tool config unset path', expected: '路径配置被移除。' },
          sources: [source],
        },
      ],
    });

    const result = generateGuide({ ecosystem, mirror, os: 'linux', shell: 'bash' });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('missing-template-value');
    expect(result.ok === false && result.message).toContain('configPath');
  });

  it('never returns raw template syntax in generated output', () => {
    const guide = expectSuccess(
      generateGuide({ ecosystem: makeEcosystem(), mirror, os: 'windows', shell: 'powershell' }),
    );
    const texts = [
      ...guide.commands.map((command) => command.command),
      guide.configFile?.content ?? '',
      guide.configFile?.path ?? '',
      guide.verification.command,
      guide.restore.command,
    ];

    for (const text of texts) {
      expect(text).not.toContain('{{');
      expect(text).not.toContain('}}');
    }
  });

  it('reports unsupported platform when the ecosystem has no templates at all', () => {
    const ecosystem = makeEcosystem({
      guides: [
        {
          ...ecosystemFixture.guides[1],
          os: 'linux',
          shell: 'bash',
        },
      ],
    });

    const result = generateGuide({ ecosystem, mirror, os: 'windows', shell: 'cmd' });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('Linux/Bash');
  });

  it('describes an ecosystem without any guide instead of promising a command', () => {
    const ecosystem = { ...makeEcosystem(), guides: [] } as unknown as Ecosystem;

    const result = generateGuide({ ecosystem, mirror, os: 'linux', shell: 'bash' });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unsupported-platform');
  });
});

describe('mirror kinds', () => {
  it('passes through publish support so the UI can warn before publishing', () => {
    const ecosystem = makeEcosystem({
      supports: [
        {
          ecosystemId: 'example',
          mirrorId: 'example-mirror',
          repositoryUrl: 'https://example.com/simple/',
          supportsPublish: true,
          sources: [source],
        },
      ],
    });

    const guide = expectSuccess(generateGuide({ ecosystem, mirror, os: 'linux', shell: 'bash' }));

    expect(guide.mirror.supportsPublish).toBe(true);
    expect(guide.mirror.kind).toBe('community');
    expect(guide.mirror.checkedAt).toBe('2026-09-18');
  });
});
