import { describe, expect, it } from 'vitest';

import { EcosystemSchema, MirrorSchema, type Ecosystem, type Mirror } from '@mirrorn/shared';
import { PACKAGE_NAME_PLACEHOLDER } from '@mirrorn/shared/generators';

import { createGuideWizard } from './wizard';

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

function makeWizard(
  options: {
    detectedOs?: 'windows' | 'macos' | 'linux';
    detectedShell?: 'powershell' | 'cmd' | 'bash' | 'zsh';
  } = {},
) {
  return createGuideWizard(ecosystem, options);
}

describe('createGuideWizard', () => {
  it('falls back to a supported platform when the detected one has no template', () => {
    const wizard = makeWizard({ detectedOs: 'macos', detectedShell: 'zsh' });

    expect(wizard.os.value).toBe('windows');
    expect(wizard.shell.value).toBe('powershell');
  });

  it('keeps the detected platform when a template exists', () => {
    const wizard = makeWizard({ detectedOs: 'linux', detectedShell: 'bash' });

    expect(wizard.os.value).toBe('linux');
    expect(wizard.shell.value).toBe('bash');
  });

  it('corrects the shell when the user switches to another system', () => {
    const wizard = makeWizard({ detectedOs: 'linux', detectedShell: 'bash' });

    wizard.setOs('windows');
    expect(wizard.shells.value).toEqual(['powershell', 'cmd']);
    expect(wizard.shell.value).toBe('powershell');
  });

  it('only exposes shells that exist for the selected system', () => {
    const wizard = makeWizard({ detectedOs: 'windows', detectedShell: 'cmd' });
    wizard.setOs('windows');
    wizard.setShell('cmd');
    expect(wizard.shell.value).toBe('cmd');

    wizard.setOs('linux');
    expect(wizard.shells.value).toEqual(['bash']);
    expect(wizard.shell.value).toBe('bash');
  });

  it('regenerates the command when another mirror is selected', () => {
    const wizard = makeWizard({ detectedOs: 'windows', detectedShell: 'powershell' });

    wizard.setMirror('tsinghua');
    expect(wizard.guide.value.ok && wizard.guide.value.guide.commands[0].command).toBe(
      `python -m pip install --index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/ ${PACKAGE_NAME_PLACEHOLDER}`,
    );

    wizard.setMirror('aliyun');
    expect(wizard.guide.value.ok && wizard.guide.value.guide.commands[0].command).toBe(
      `python -m pip install --index-url https://mirrors.aliyun.com/pypi/simple/ ${PACKAGE_NAME_PLACEHOLDER}`,
    );
  });

  it('never mixes shell syntax across systems', () => {
    const wizard = makeWizard({ detectedOs: 'linux', detectedShell: 'bash' });

    wizard.setOs('windows');
    wizard.setShell('cmd');

    const guide = wizard.guide.value;
    expect(guide.ok).toBe(true);
    expect(guide.ok && guide.guide.platform.shell).toBe('cmd');
    expect(guide.ok && guide.guide.platform.os).toBe('windows');
    expect(guide.ok && guide.guide.commands[0].command.startsWith('python -m pip')).toBe(true);
  });

  it('exposes a failure reason instead of a command for unsupported selections', () => {
    const wizard = makeWizard({ detectedOs: 'linux', detectedShell: 'bash' });
    const noTemplates = createGuideWizard({ ...ecosystem, guides: [] } as unknown as Ecosystem, {
      mirrors,
      detectedOs: 'linux',
      detectedShell: 'bash',
    });

    expect(wizard.guide.value.ok).toBe(true);
    expect(noTemplates.guide.value.ok).toBe(false);
    expect(noTemplates.guide.value.ok === false && noTemplates.guide.value.reason).toBe(
      'unsupported-platform',
    );
  });

  it('selects a mode that the current platform actually supports', () => {
    const wizard = makeWizard({ detectedOs: 'windows', detectedShell: 'powershell' });

    expect(wizard.mode.value).toBe('temporary');
    expect(wizard.modes.value).toContain('persistent');
  });
});

describe('step navigation', () => {
  it('blocks moving to the next step when the selection cannot generate a guide', () => {
    const wizard = createGuideWizard({ ...ecosystem, guides: [] } as unknown as Ecosystem, {
      detectedOs: 'linux',
      detectedShell: 'bash',
    });

    expect(wizard.canProceed.value).toBe(false);
    wizard.next();
    expect(wizard.step.value).toBe(1);
  });

  it('allows walking through all four steps with a valid selection', () => {
    const wizard = makeWizard({ detectedOs: 'linux', detectedShell: 'bash' });

    wizard.goToStep(2);
    expect(wizard.canProceed.value).toBe(true);

    wizard.next();
    wizard.next();
    expect(wizard.step.value).toBe(4);

    wizard.next();
    expect(wizard.step.value).toBe(4);

    wizard.previous();
    expect(wizard.step.value).toBe(3);

    wizard.goToStep(1);
    expect(wizard.step.value).toBe(1);
  });
});
