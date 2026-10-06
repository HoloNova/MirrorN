import { describe, expect, it } from 'vitest';

import {
  artifactsFor,
  compareVersions,
  detectPlatform,
  fillTutorial,
  humanSize,
  parseEcosystemList,
  parseResourceDetail,
  parseResourceList,
  platformsOf,
  versionsFor,
  type Artifact,
} from './downloads';

const artifact = (over: Partial<Artifact> = {}): Artifact => ({
  version: '26.7.1-1',
  platform: 'linux',
  arch: 'x64',
  format: 'sh',
  filename: 'Miniconda3-py314_26.7.1-1-Linux-x86_64.sh',
  url: 'https://mirrors.pku.edu.cn/anaconda/miniconda/Miniconda3-py314_26.7.1-1-Linux-x86_64.sh',
  size: 100,
  ...over,
});

const resource = {
  id: 'pku:anaconda',
  siteId: 'pku',
  siteName: '北京大学开源镜像站',
  repoId: 'anaconda',
  name: 'Anaconda',
  ecosystemId: 'anaconda-installer',
  ecosystemLabel: 'Miniconda（Python）',
  ecosystemCategory: 'language',
  kind: 'installer',
  downloadEntry: 'https://mirrors.pku.edu.cn/anaconda/miniconda/',
  versionsHint: '平铺',
  platforms: ['linux'],
  helpDocUrl: null,
  tutorialId: 'miniconda',
  artifactCount: 1,
  latestVersion: '26.7.1-1',
  downloadMode: 'files' as const,
};

describe('资源数据', () => {
  it('只接受镜像站自己域名下的文件直链，拒收其它地址', () => {
    const parsed = parseResourceDetail({
      resource,
      artifacts: [artifact(), artifact({ url: 'https://evil.example/x.sh' })],
    });
    expect(parsed?.artifacts).toHaveLength(1);
    expect(parsed?.artifacts[0]?.filename).toBe(artifact().filename);
  });

  it('结构不符时返回 undefined，页面据此降级而不是显示坏数据', () => {
    expect(parseResourceDetail({ artifacts: [] })).toBeUndefined();
    expect(parseResourceDetail({ resource, artifacts: 'x' })).toBeUndefined();
    expect(parseResourceList({ items: [resource, { id: 1 }] })?.length).toBe(1);
    expect(
      parseEcosystemList({
        items: [{ id: 'debian', label: 'Debian', category: 'distro', resourceCount: 4 }],
      })?.length,
    ).toBe(1);
    // 缺字段的条目会被丢掉：宁可少一个筛选项，也不显示坏数据。
    expect(
      parseEcosystemList({ items: [{ id: 'debian', label: 'Debian', category: 'distro' }] }),
    ).toEqual([]);
  });

  it('版本按数字段倒序；同一版本下按架构与格式排列', () => {
    const artifacts = [
      artifact({ version: '26.7.1-1', arch: 'arm64' }),
      artifact({ version: '26.10.0-1', arch: 'x64', filename: 'b.sh' }),
      artifact({ version: '26.9.0-1', arch: 'x64', filename: 'c.sh' }),
    ];
    expect(versionsFor(artifacts, 'linux')).toEqual(['26.10.0-1', '26.9.0-1', '26.7.1-1']);
    expect(artifactsFor(artifacts, '26.10.0-1', 'linux').map((item) => item.arch)).toEqual(['x64']);
    expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0);
  });

  it('平台顺序按用户最可能用的系统排，未知平台排最后', () => {
    const artifacts = [
      artifact({ platform: 'unknown' }),
      artifact({ platform: 'linux' }),
      artifact({ platform: 'windows' }),
    ];
    expect(platformsOf(artifacts)).toEqual(['windows', 'linux', 'unknown']);
  });

  it('macOS 不推断架构（Safari 会把自己报成 Intel）', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toEqual({
      os: 'macos',
      arch: undefined,
    });
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toEqual({ os: 'linux', arch: 'x64' });
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toEqual({
      os: 'windows',
      arch: 'x64',
    });
  });

  it('文件大小按人读的单位显示，未知大小不编数字', () => {
    expect(humanSize(132526808)).toBe('126 MB');
    expect(humanSize(undefined)).toBe('');
    expect(humanSize(0)).toBe('');
  });

  it('缺失版本和通用平台的 ISO 保留直链，不被本机系统筛掉', () => {
    const iso = artifact({
      version: '',
      platform: 'any',
      arch: 'x64',
      filename: 'ubuntu-daily.iso',
      url: 'https://mirrors.pku.edu.cn/ubuntu-cdimage/ubuntu-daily.iso',
    });
    const parsed = parseResourceDetail({ resource, artifacts: [iso] });
    expect(parsed?.artifacts).toHaveLength(1);
    expect(versionsFor(parsed?.artifacts ?? [], 'windows')).toEqual(['']);
    expect(artifactsFor(parsed?.artifacts ?? [], '', 'windows')).toEqual([iso]);
  });

  it('不限平台时版本与文件都算进来（ISO/数据集本来就不分系统）', () => {
    const artifacts = [
      artifact({
        version: '13.7.0',
        platform: 'any',
        arch: 'x64',
        filename: 'debian-13.7.0-amd64-netinst.iso',
      }),
      artifact({
        version: '13.7.0',
        platform: 'any',
        arch: 'arm64',
        filename: 'debian-13.7.0-arm64-netinst.iso',
      }),
      artifact({
        version: '12.9.0',
        platform: 'any',
        arch: 'x64',
        filename: 'debian-12.9.0-amd64-netinst.iso',
      }),
    ];
    expect(versionsFor(artifacts, '')).toEqual(['13.7.0', '12.9.0']);
    expect(artifactsFor(artifacts, '13.7.0', '').map((item) => item.arch)).toEqual([
      'arm64',
      'x64',
    ]);
  });

  it('教程正文按用户选中的文件替换占位符，没选到就如实写“还没选”', () => {
    const body = '你下载的是 `{{filename}}`（{{platform}} · {{version}}），来自 {{site}}。';
    expect(
      fillTutorial(body, {
        filename: 'node-v24.1.0-linux-x64.tar.xz',
        platform: 'linux',
        version: 'v24.1.0',
        site: '北京大学开源镜像站',
      }),
    ).toBe(
      '你下载的是 `node-v24.1.0-linux-x64.tar.xz`（Linux · v24.1.0），来自 北京大学开源镜像站。',
    );
    expect(
      fillTutorial(body, {}).startsWith('你下载的是 `（还没选文件）`（ · （还没选版本））'),
    ).toBe(true);
  });
});
