import { describe, expect, it } from 'vitest';

import { generateGuide } from '@mirrorn/shared/generators';

import { buildConfigDiffView } from './configBaseline';
import { getCatalog, getEcosystem, listEcosystemMirrors } from './ecosystems';

const catalog = getCatalog();

function ecosystemOf(id: string) {
  const ecosystem = getEcosystem(id, catalog);
  if (!ecosystem) {
    throw new Error(`测试依赖 data/ecosystems/${id}.json`);
  }
  return ecosystem;
}

const apt = ecosystemOf('apt');
const aptMirrors = listEcosystemMirrors(apt, catalog);

function render(
  ecosystem: typeof apt,
  mirrors: typeof aptMirrors,
  mirrorId: string,
  version: string,
): { content: string; path: string } {
  const mirror = mirrors.find((item) => item.id === mirrorId);
  if (!mirror) {
    throw new Error(`缺少镜像数据：${mirrorId}`);
  }
  const generated = generateGuide({ ecosystem, mirror, os: 'linux', shell: 'bash', version });
  if (!generated.ok || !generated.guide.configFile) {
    throw new Error(`生成失败：${mirrorId} ${version}`);
  }
  return {
    content: generated.guide.configFile.content,
    path: generated.guide.configFile.path,
  };
}

function viewFor(
  ecosystem: typeof apt,
  mirrors: typeof aptMirrors,
  mirrorId: string,
  version: string,
  baselineMirrors = mirrors,
) {
  const file = render(ecosystem, mirrors, mirrorId, version);
  return buildConfigDiffView({
    ecosystem,
    mirrors: baselineMirrors,
    os: 'linux',
    shell: 'bash',
    version,
    content: file.content,
    path: file.path,
  });
}

describe('buildConfigDiffView', () => {
  it('用真实的官方基线与所选镜像渲染出对照（apt 24.04）', () => {
    const view = viewFor(apt, aptMirrors, 'tsinghua', '24.04');

    expect(view?.baselineName).toContain('Ubuntu');
    expect(view?.path).toBe('/etc/apt/sources.list.d/ubuntu.sources');
    // deb822 里只有归档仓库的 URIs 一行是生效配置，另一处变化在注释里。
    expect(view?.diff.effectiveChanged).toBe(1);
    expect(view?.diff.commentChanged).toBe(1);
    // 安全更新保持官方源：它不在变化列表里，所以界面上不会被读成“也改了”。
    expect(view?.diff.lines.some((line) => line.text.includes('security.ubuntu.com'))).toBe(false);
  });

  it('一行式的 sources.list 里三条归档行会改（apt 22.04）', () => {
    const view = viewFor(apt, aptMirrors, 'tsinghua', '22.04');

    expect(view?.diff.effectiveChanged).toBe(3);
    expect(view?.diff.lines.filter((line) => line.kind === 'removed')).toHaveLength(6);
  });

  it('docker-ce 也在名单里：只有 URIs 一行会改', () => {
    const dockerCe = ecosystemOf('docker-ce');
    const mirrors = listEcosystemMirrors(dockerCe, catalog);
    const view = viewFor(dockerCe, mirrors, 'tsinghua', '24.04');

    expect(view?.path).toBe('/etc/apt/sources.list.d/docker.sources');
    expect(view?.diff.effectiveChanged).toBe(1);
    expect(view?.diff.commentChanged).toBe(0);
    expect(view?.diff.kept).toBe(6);
  });

  it('选中官方源本身时没有可对照的差异', () => {
    expect(viewFor(apt, aptMirrors, 'ubuntu-official', '24.04')).toBeUndefined();
  });

  it('没有官方基线时不显示对照卡', () => {
    const view = viewFor(
      apt,
      aptMirrors,
      'tsinghua',
      '24.04',
      aptMirrors.filter((mirror) => mirror.kind !== 'official'),
    );

    expect(view).toBeUndefined();
  });

  it('单行配置的生态不在名单里，因此不显示对照卡', () => {
    const pip = getEcosystem('pip', catalog);
    if (!pip) {
      throw new Error('测试依赖 data/ecosystems/pip.json');
    }
    const pipMirrors = listEcosystemMirrors(pip, catalog);
    const mirror = pipMirrors.find((item) => item.id === 'tsinghua');
    if (!mirror) {
      throw new Error('缺少镜像数据：tsinghua');
    }
    const generated = generateGuide({ ecosystem: pip, mirror, os: 'linux', shell: 'bash' });
    if (!generated.ok || !generated.guide.configFile) {
      throw new Error('pip 生成失败');
    }

    expect(
      buildConfigDiffView({
        ecosystem: pip,
        mirrors: pipMirrors,
        os: 'linux',
        shell: 'bash',
        content: generated.guide.configFile.content,
        path: generated.guide.configFile.path,
      }),
    ).toBeUndefined();
  });
});
