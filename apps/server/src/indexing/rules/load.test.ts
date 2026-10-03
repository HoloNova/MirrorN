import { mkdtempSync, cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
} from '@mirrorn/shared';
function edited<T>(path: string, mutate: (data: T) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'rule-contract-'));
  try {
    cpSync(join(defaultRuleDataDir, 'download-rules'), join(directory, 'download-rules'), {
      recursive: true,
    });
    for (const file of ['software.json', 'ecosystem-taxonomy.json'])
      cpSync(join(defaultRuleDataDir, file), join(directory, file));
    mkdirSync(join(directory, 'site-resources'));
    cpSync(
      join(defaultRuleDataDir, 'site-resources/pku.json'),
      join(directory, 'site-resources/pku.json'),
    );
    const file = join(directory, path);
    const value = JSON.parse(readFileSync(file, 'utf8')) as T;
    mutate(value);
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
    expect(set.active.length).toBe(25);
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
        siteId: 'ustc',
      }),
    ).toThrow();
    expect(() => DownloadTemplateSchema.parse({ id: 'plugin', maxDepth: 1 })).toThrow();
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
