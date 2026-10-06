import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadDownloadRules, defaultRuleDataDir } from './load.js';
import {
  DownloadRuleSchema,
  DownloadBindingSchema,
  DownloadTemplateSchema,
  type DownloadRule,
  type DownloadBinding,
  type SoftwareIdentity,
  type SiteResourceList,
} from '@mirrorn/shared';
function edited<T>(path: string, mutate: (data: T, directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'rule-contract-'));
  try {
    cpSync(join(defaultRuleDataDir, 'download-rules'), join(directory, 'download-rules'), {
      recursive: true,
    });
    for (const file of ['software.json', 'ecosystem-taxonomy.json'])
      cpSync(join(defaultRuleDataDir, file), join(directory, file));
    cpSync(join(defaultRuleDataDir, 'site-resources'), join(directory, 'site-resources'), {
      recursive: true,
    });
    const file = join(directory, path);
    const value = JSON.parse(readFileSync(file, 'utf8')) as T;
    mutate(value, directory);
    writeFileSync(file, JSON.stringify(value));
    return loadDownloadRules(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
describe('发布时校验与一次性规则快照', () => {
  it('规则与站点绑定分离，全部真实身份引用，停用/draft不执行', () => {
    const set = loadDownloadRules();
    expect(set.identities.length).toBe(28);
    expect(set.active.length).toBe(29);
    expect(
      set.active
        .filter((b) => b.siteId === 'tsinghua')
        .map((b) => b.ruleId)
        .sort(),
    ).toEqual(['anaconda', 'miniconda', 'nodejs', 'ubuntu']);
    expect(set.active.some((b) => b.siteId === 'ustc')).toBe(false);
    expect(set.active.some((b) => b.ruleId === 'spark')).toBe(false);
    expect(Object.isFrozen(set.rules.get('nodejs'))).toBe(true);
    expect(set.revision).toBe(loadDownloadRules().revision);
  });
  it('配置改动只在下一次加载产生新版本，当前对象不热更新', () => {
    const old = loadDownloadRules();
    const changed = edited<DownloadRule[]>('download-rules/software/rules.json', (rows) => {
      rows[0].evidenceRefs.push('review update');
    });
    expect(changed.revision).not.toBe(old.revision);
    expect(old.rules.get('nodejs')!.evidenceRefs).not.toContain('review update');
  });
  it('未知字段不能携带脚本，站点不能越界，模板不是任意插件', () => {
    expect(() =>
      DownloadRuleSchema.parse({ ...loadDownloadRules().rules.get('nodejs'), script: 'eval(x)' }),
    ).toThrow();
    expect(() =>
      DownloadBindingSchema.parse({
        ...loadDownloadRules().bindings.get('pku-nodejs'),
        siteId: 'unverified',
      }),
    ).toThrow();
    expect(() => DownloadTemplateSchema.parse({ id: 'plugin', maxDepth: 1 })).toThrow();
  });
  it('软件规范标识不要求与每站物理仓库路径相同', () => {
    const set = edited<DownloadBinding[]>(
      'download-rules/sites/tsinghua.json',
      (rows, directory) => {
        const binding = rows.find((b) => b.ruleId === 'nodejs')!;
        binding.repoId = 'node';
        binding.rootPath = 'node/';
        const path = join(directory, 'site-resources/tsinghua.json');
        const list = JSON.parse(readFileSync(path, 'utf8')) as SiteResourceList;
        const repo = list.resources.find((r) => r.id === 'nodejs-release')!;
        repo.id = 'node';
        repo.downloadEntry = 'https://mirrors.tuna.tsinghua.edu.cn/node/';
        writeFileSync(path, JSON.stringify(list));
      },
    );
    expect(set.bindings.get('tsinghua-nodejs')?.repoId).toBe('node');
    expect(set.identities.find((identity) => identity.slug === 'nodejs')?.resourceKey).toBe(
      'nodejs-release',
    );
  });
  it('站点文件不能假冒其它站，仓库与软件生态必须对应', () => {
    expect(() =>
      edited<DownloadBinding[]>('download-rules/sites/tsinghua.json', (rows) => {
        rows[0].siteId = 'pku';
      }),
    ).toThrow('所属站点');
    expect(() =>
      edited<DownloadBinding[]>('download-rules/sites/tsinghua.json', (rows) => {
        rows[0].repoId = 'ubuntu-releases';
        rows[0].rootPath = 'ubuntu-releases/';
      }),
    ).toThrow('生态不一致');
    expect(() =>
      edited<{ bindings: string[] }>('download-rules/manifest.json', (manifest) => {
        manifest.bindings.push('sites/tsinghua.json');
      }),
    ).toThrow('不能重复');
  });
  it('不存在的捕获、身份、模板以及静态版本根，在启动前拒绝', () => {
    expect(() =>
      edited<DownloadRule[]>('download-rules/software/rules.json', (rows) => {
        rows[0].matches[0].platformCapture = 'missing';
      }),
    ).toThrow('捕获组');
    expect(() =>
      edited<SoftwareIdentity[]>('software.json', (rows) => {
        rows[0].ecosystemId = 'unknown';
      }),
    ).toThrow('引用无效');
    expect(() =>
      edited<DownloadRule[]>('download-rules/software/rules.json', (rows) => {
        rows[0].templateId = 'unknown';
      }),
    ).toThrow('模板');
    expect(() =>
      edited<DownloadBinding[]>('download-rules/sites/pku.json', (rows) => {
        rows[0].rootPath = 'nodejs-release/v24.1.0/';
      }),
    ).toThrow('动态发布根');
  });
});
