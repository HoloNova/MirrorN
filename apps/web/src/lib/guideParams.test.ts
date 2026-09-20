import { describe, expect, it } from 'vitest';

import { EcosystemSchema, MirrorSchema, type Ecosystem, type Mirror } from '@mirrorn/shared';
import { PACKAGE_NAME_PLACEHOLDER } from '@mirrorn/shared/generators';

import { createGuideParams } from './guideParams';

const source = { url: 'https://example.com/source', checkedAt: '2026-09-18' };

const mirrors: Mirror[] = [
  MirrorSchema.parse({
    id: 'tsinghua',
    name: '清华大学开源软件镜像站',
    kind: 'university',
    homepageUrl: 'https://mirrors.tuna.tsinghua.edu.cn/',
    aliases: ['tuna', '清华源'],
    sources: [source],
  }),
  MirrorSchema.parse({
    id: 'aliyun',
    name: '阿里云开发者镜像站',
    kind: 'commercial',
    homepageUrl: 'https://developer.aliyun.com/mirror/',
    aliases: ['aliyun', '阿里云'],
    sources: [source],
  }),
  MirrorSchema.parse({
    id: 'pypi-official',
    name: 'PyPI 官方源',
    kind: 'official',
    homepageUrl: 'https://pypi.org/',
    aliases: ['pypi官方源'],
    sources: [source],
  }),
];

const ecosystem: Ecosystem = EcosystemSchema.parse({
  id: 'pip',
  name: 'Python / pip',
  packageManager: 'pip',
  description: '示例生态。',
  prerequisites: ['已安装 Python 与 pip。'],
  aliases: ['python'],
  supports: [
    {
      ecosystemId: 'pip',
      mirrorId: 'pypi-official',
      repositoryUrl: 'https://pypi.org/simple/',
      sources: [source],
    },
    {
      ecosystemId: 'pip',
      mirrorId: 'tsinghua',
      repositoryUrl: 'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/',
      sources: [source],
    },
    {
      ecosystemId: 'pip',
      mirrorId: 'aliyun',
      repositoryUrl: 'https://mirrors.aliyun.com/pypi/simple/',
      sources: [source],
    },
  ],
  guides: [
    {
      id: 'pip-windows-powershell',
      os: 'windows',
      shell: 'powershell',
      variables: ['mirrorUrl', 'packageName'],
      temporary: {
        label: '单次安装使用镜像',
        command: 'python -m pip install --index-url {{mirrorUrl}} {{packageName}}',
      },
      persistent: {
        label: '设置用户级默认源',
        command: 'python -m pip config set global.index-url {{mirrorUrl}}',
      },
      verification: {
        command: 'python -m pip config get global.index-url',
        expected: '包含地址。',
      },
      restore: { command: 'python -m pip config unset global.index-url', expected: '已移除。' },
      sources: [source],
    },
    {
      id: 'pip-windows-cmd',
      os: 'windows',
      shell: 'cmd',
      variables: ['mirrorUrl', 'packageName'],
      temporary: {
        label: '单次安装使用镜像',
        command: 'python -m pip install --index-url {{mirrorUrl}} {{packageName}}',
      },
      persistent: {
        label: '设置用户级默认源',
        command: 'python -m pip config set global.index-url {{mirrorUrl}}',
      },
      verification: {
        command: 'python -m pip config get global.index-url',
        expected: '包含地址。',
      },
      restore: { command: 'python -m pip config unset global.index-url', expected: '已移除。' },
      sources: [source],
    },
    {
      id: 'pip-linux-bash',
      os: 'linux',
      shell: 'bash',
      variables: ['mirrorUrl', 'packageName'],
      temporary: {
        label: '单次安装使用镜像',
        command: 'python3 -m pip install --index-url {{mirrorUrl}} {{packageName}}',
      },
      persistent: {
        label: '设置用户级默认源',
        command: 'python3 -m pip config set global.index-url {{mirrorUrl}}',
      },
      verification: {
        command: 'python3 -m pip config get global.index-url',
        expected: '包含地址。',
      },
      restore: { command: 'python3 -m pip config unset global.index-url', expected: '已移除。' },
      sources: [source],
    },
  ],
  sources: [source],
});

function makeParams(
  options: {
    detectedOs?: 'windows' | 'macos' | 'linux';
    detectedShell?: 'powershell' | 'cmd' | 'bash' | 'zsh';
  } = {},
) {
  return createGuideParams(ecosystem, options);
}

describe('createGuideParams', () => {
  it('falls back to a supported platform when the detected one has no template', () => {
    const params = makeParams({ detectedOs: 'macos', detectedShell: 'zsh' });

    expect(params.os.value).toBe('windows');
    expect(params.shell.value).toBe('powershell');
  });

  it('keeps the detected platform when a template exists', () => {
    const params = makeParams({ detectedOs: 'linux', detectedShell: 'bash' });

    expect(params.os.value).toBe('linux');
    expect(params.shell.value).toBe('bash');
  });

  it('corrects the shell when the user switches to another system', () => {
    const params = makeParams({ detectedOs: 'linux', detectedShell: 'bash' });

    params.setOs('windows');
    expect(params.shells.value).toEqual(['powershell', 'cmd']);
    expect(params.shell.value).toBe('powershell');
  });

  it('only exposes shells that exist for the selected system', () => {
    const params = makeParams({ detectedOs: 'windows', detectedShell: 'cmd' });
    params.setOs('windows');
    params.setShell('cmd');
    expect(params.shell.value).toBe('cmd');

    params.setOs('linux');
    expect(params.shells.value).toEqual(['bash']);
    expect(params.shell.value).toBe('bash');
  });

  it('regenerates the command when another mirror is selected', () => {
    const params = makeParams({ detectedOs: 'windows', detectedShell: 'powershell' });

    params.setMirror('tsinghua');
    expect(params.guide.value.ok && params.guide.value.guide.commands[0].command).toBe(
      `python -m pip install --index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/ ${PACKAGE_NAME_PLACEHOLDER}`,
    );

    params.setMirror('aliyun');
    expect(params.guide.value.ok && params.guide.value.guide.commands[0].command).toBe(
      `python -m pip install --index-url https://mirrors.aliyun.com/pypi/simple/ ${PACKAGE_NAME_PLACEHOLDER}`,
    );
  });

  it('never mixes shell syntax across systems', () => {
    const params = makeParams({ detectedOs: 'linux', detectedShell: 'bash' });

    params.setOs('windows');
    params.setShell('cmd');

    const guide = params.guide.value;
    expect(guide.ok).toBe(true);
    expect(guide.ok && guide.guide.platform.shell).toBe('cmd');
    expect(guide.ok && guide.guide.platform.os).toBe('windows');
    expect(guide.ok && guide.guide.commands[0].command.startsWith('python -m pip')).toBe(true);
  });

  it('exposes a failure reason instead of a command for unsupported selections', () => {
    const params = makeParams({ detectedOs: 'linux', detectedShell: 'bash' });
    const noTemplates = createGuideParams({ ...ecosystem, guides: [] } as unknown as Ecosystem, {
      mirrors,
      detectedOs: 'linux',
      detectedShell: 'bash',
    });

    expect(params.guide.value.ok).toBe(true);
    expect(noTemplates.guide.value.ok).toBe(false);
    expect(noTemplates.guide.value.ok === false && noTemplates.guide.value.reason).toBe(
      'unsupported-platform',
    );
  });
});

describe('recommended mirror selection', () => {
  it('uses the recommended mirror until the user chooses one', () => {
    const params = makeParams({ detectedOs: 'linux', detectedShell: 'bash' });
    expect(params.mirrors.value[0]?.id).toBe('pypi-official');

    params.applyRecommendation('tsinghua');

    expect(params.mirrorId.value).toBe('tsinghua');
    expect(params.mirrorPinned.value).toBe(false);
    const guide = params.guide.value;
    expect(guide.ok && guide.guide.commands[0].command).toContain(
      'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/',
    );
  });

  it('keeps updating the default while the user has not touched the list', () => {
    const params = makeParams({ detectedOs: 'linux', detectedShell: 'bash' });

    params.applyRecommendation('aliyun');
    params.applyRecommendation('tsinghua');

    expect(params.mirrorId.value).toBe('tsinghua');
  });

  it('never replaces a mirror the user selected manually', () => {
    const params = makeParams({ detectedOs: 'linux', detectedShell: 'bash' });

    params.setMirror('aliyun');
    expect(params.mirrorPinned.value).toBe(true);

    params.applyRecommendation('tsinghua');

    expect(params.mirrorId.value).toBe('aliyun');
    const guide = params.guide.value;
    expect(guide.ok && guide.guide.commands[0].command).toContain(
      'https://mirrors.aliyun.com/pypi/simple/',
    );
  });

  it('ignores a recommendation that is not part of the current candidates', () => {
    const params = makeParams({ detectedOs: 'linux', detectedShell: 'bash' });

    params.applyRecommendation('mirror-that-does-not-exist');

    expect(params.mirrorId.value).toBe('pypi-official');
  });

  it('keeps the user selection when there is no recommendation at all', () => {
    const params = makeParams({ detectedOs: 'linux', detectedShell: 'bash' });

    params.applyRecommendation(undefined);

    expect(params.mirrorId.value).toBe('pypi-official');
  });
});

describe('createGuideParams 的发行版版本选择', () => {
  /** 带三个 Ubuntu LTS 版本的示例生态：两个用一行式、一个用 deb822。 */
  const versionedEcosystem: Ecosystem = EcosystemSchema.parse({
    id: 'apt',
    name: 'Ubuntu / apt',
    packageManager: 'apt',
    description: '示例生态。',
    prerequisites: ['只覆盖列出的 Ubuntu LTS。'],
    aliases: ['ubuntu'],
    supports: [
      {
        ecosystemId: 'apt',
        mirrorId: 'tsinghua',
        repositoryUrl: 'https://mirrors.tuna.tsinghua.edu.cn/ubuntu/',
        sources: [source],
      },
    ],
    guides: [
      {
        id: 'apt-ubuntu-2404-bash',
        os: 'linux',
        shell: 'bash',
        distribution: 'ubuntu',
        version: '24.04',
        variables: ['mirrorUrl'],
        persistent: { label: '换源', command: 'write deb822 {{mirrorUrl}}' },
        verification: { command: 'apt update', expected: '包含镜像地址。' },
        restore: { command: 'restore', expected: '已还原。' },
        sources: [source],
      },
      {
        id: 'apt-ubuntu-2204-bash',
        os: 'linux',
        shell: 'bash',
        distribution: 'ubuntu',
        version: '22.04',
        variables: ['mirrorUrl'],
        persistent: { label: '换源', command: 'write sources.list {{mirrorUrl}}' },
        verification: { command: 'apt update', expected: '包含镜像地址。' },
        restore: { command: 'restore', expected: '已还原。' },
        sources: [source],
      },
    ],
    sources: [source],
  });

  it('把数据里的版本顺序作为默认选择，并在命令里体现所选版本', () => {
    const params = createGuideParams(versionedEcosystem, { detectedOs: 'linux' });

    expect(params.versions.value).toEqual(['24.04', '22.04']);
    expect(params.version.value).toBe('24.04');
    expect(params.versionLabel.value).toBe('ubuntu 24.04');
    expect(params.guide.value.ok && params.guide.value.guide.commands[0]?.command).toBe(
      'write deb822 https://mirrors.tuna.tsinghua.edu.cn/ubuntu/',
    );

    params.setVersion('22.04');

    expect(params.version.value).toBe('22.04');
    expect(params.guide.value.ok && params.guide.value.guide.commands[0]?.command).toBe(
      'write sources.list https://mirrors.tuna.tsinghua.edu.cn/ubuntu/',
    );
  });

  it('系统没有按版本区分的模板时，不显示版本选择器', () => {
    const params = createGuideParams(ecosystem, { detectedOs: 'windows', detectedShell: 'cmd' });

    expect(params.versions.value).toEqual([]);
    expect(params.version.value).toBeUndefined();
    expect(params.versionLabel.value).toBeUndefined();
  });

  it('切换到没有版本维度的系统时清空版本，切回来时重新落到默认版本', () => {
    const mixed: Ecosystem = EcosystemSchema.parse({
      ...versionedEcosystem,
      guides: [
        ...versionedEcosystem.guides,
        {
          id: 'apt-windows-powershell',
          os: 'windows',
          shell: 'powershell',
          variables: ['mirrorUrl'],
          persistent: { label: '换源', command: 'Set-Item {{mirrorUrl}}' },
          verification: { command: 'Get-Item', expected: '包含地址。' },
          restore: { command: 'Remove-Item', expected: '已移除。' },
          sources: [source],
        },
      ],
    });

    const params = createGuideParams(mixed, { detectedOs: 'linux' });
    expect(params.version.value).toBe('24.04');

    params.setOs('windows');
    expect(params.version.value).toBeUndefined();

    params.setOs('linux');
    expect(params.version.value).toBe('24.04');
  });
});
