import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { loadDownloadRules } from './load.js';
import { classifyFile } from './classify.js';
import { directoryDecision } from './templates.js';
const set = loadDownloadRules();
const fixtures = JSON.parse(
  readFileSync(
    new URL('../../../../../docs/research/pku-rule-review/samples.reviewed.json', import.meta.url),
    'utf8',
  ),
) as {
  cases: {
    ruleId: string;
    positives: {
      filename: string;
      evidenceUrl: string;
      expectedCaptures: Record<string, string>;
    }[];
    negatives: { filename: string }[];
  }[];
};
const evidence = JSON.parse(
  readFileSync(
    new URL('../../../../../docs/research/pku-rule-review/metadata-evidence.json', import.meta.url),
    'utf8',
  ),
) as { records: { url: string; entries?: { name: string }[] }[] };
function context(ruleId: string, directory: string, filename: string, names: string[] = []) {
  const binding = [...set.bindings.values()].find((b) => b.ruleId === ruleId)!;
  return classifyFile(set, binding, directory, filename, names);
}
describe('真实研究样本驱动实际判定器，不只测试正则', () => {
  for (const group of fixtures.cases) {
    for (const sample of group.positives)
      it(`${group.ruleId} 接受 ${sample.filename}`, () => {
        const directory = sample.evidenceUrl.replace('/files/', '/');
        const names =
          evidence.records.find((r) => r.url === sample.evidenceUrl)?.entries?.map((r) => r.name) ??
          [];
        const result = context(group.ruleId, directory, sample.filename, names);
        expect(result.decision).toBe('accepted');
        if (result.decision === 'accepted') {
          expect(result.download.format).toBe(sample.expectedCaptures.format);
          if (sample.expectedCaptures.version)
            expect(result.download.version).toBe(sample.expectedCaptures.version);
          expect(result.download.metadata?.ruleRevision).toBe(set.revision);
          if (sample.expectedCaptures.scalaBuild)
            expect(result.download.metadata?.variant?.scalaBuild).toBe(
              sample.expectedCaptures.scalaBuild,
            );
        }
      });
    for (const sample of group.negatives ?? [])
      it(`${group.ruleId} 不接收 ${sample.filename}`, () => {
        const directory = group.positives[0]?.evidenceUrl.replace('/files/', '/');
        if (directory)
          expect(context(group.ruleId, directory, sample.filename).decision).not.toBe('accepted');
      });
  }
  it('Node源码不能因压缩格式放行；Linux tar.gz与无平台后缀PKG仍接受', () => {
    const dir = 'https://mirrors.pku.edu.cn/nodejs-release/v24.1.0/';
    expect(context('nodejs', dir, 'node-v24.1.0.tar.gz').decision).toBe('rejected');
    expect(context('nodejs', dir, 'node-v24.1.0-linux-x64.tar.gz').decision).toBe('accepted');
    const pkg = context('nodejs', dir, 'node-v24.1.0.pkg');
    expect(pkg.decision === 'accepted' && pkg.download.arch).toBe('unknown');
  });
  it('TeX年度标记缺失或冲突不猜年份；Unix安装器不会变成Windows下载', () => {
    const dir = 'https://mirrors.pku.edu.cn/ctan/systems/texlive/tlnet/';
    expect(context('texlive', dir, 'install-tl-unx.tar.gz').decision).toBe('pending');
    expect(
      context('texlive', dir, 'install-tl-unx.tar.gz', ['TEXLIVE_2025', 'TEXLIVE_2026']).decision,
    ).toBe('pending');
    const result = context('texlive', dir, 'install-tl-unx.tar.gz', ['TEXLIVE_2026']);
    expect(result.decision === 'accepted' && result.download.metadata?.platforms).toEqual([
      'linux',
      'macos',
    ]);
  });
  it('日期、目录用途与格式都参与判断；目录年份不覆盖文件版本', () => {
    expect(
      context(
        'mactex',
        'https://mirrors.pku.edu.cn/ctan/systems/mac/mactex/',
        'mactex-20261301.pkg',
      ).decision,
    ).toBe('pending');
    expect(
      context(
        'tomcat',
        'https://mirrors.pku.edu.cn/apache/tomcat/tomcat-11/v11.0.26/src/',
        'apache-tomcat-11.0.26.tar.gz',
      ).decision,
    ).not.toBe('accepted');
    const result = context(
      'kubuntu',
      'https://mirrors.pku.edu.cn/ubuntu-cdimage/kubuntu/releases/24.04.5/release/',
      'kubuntu-24.04.3-desktop-amd64.iso',
    );
    expect(result.decision === 'accepted' && result.download.version).toBe('24.04.3');
  });
  it('同一文件的软件归属冲突不采用第一条匹配', () => {
    const binding = set.bindings.get('pku-mactex')!;
    const other = { ...set.rules.get('mactex')!, id: 'conflict', softwareIds: ['basictex'] };
    const conflict = {
      ...set,
      rules: new Map([...set.rules, ['conflict', other]]),
      active: [...set.active, { ...binding, id: 'conflict', ruleId: 'conflict' }],
    };
    expect(
      classifyFile(
        conflict,
        binding,
        'https://mirrors.pku.edu.cn/ctan/systems/mac/mactex/',
        'mactex-20260301.pkg',
      ).decision,
    ).toBe('pending');
  });
  it('目录发现与文件判断独立，未知结构不自动跳进依赖仓库', () => {
    const binding = set.bindings.get('pku-ubuntu')!;
    expect(
      directoryDecision(binding, 'https://mirrors.pku.edu.cn/ubuntu-releases/', 0, '30.04'),
    ).toBe('descend');
    expect(
      directoryDecision(binding, 'https://mirrors.pku.edu.cn/ubuntu-releases/', 0, 'pool'),
    ).toBe('rejected');
    expect(
      directoryDecision(binding, 'https://mirrors.pku.edu.cn/ubuntu-releases/', 0, 'new-layout'),
    ).toBe('pending');
  });
});
