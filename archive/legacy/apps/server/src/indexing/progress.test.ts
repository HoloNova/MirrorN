import { expect, it } from 'vitest';
import { fixtureRun, indexFixture } from '../db/indexFixture.js';
import type { InstallerJob } from './installers.js';
import { IndexProgress } from './progress.js';
import { loadDownloadRules } from './rules/load.js';

const rules = loadDownloadRules();
function root(bindingId: string, epoch = 1): Extract<InstallerJob, { kind: 'directory' }> {
  const binding = rules.bindings.get(bindingId)!;
  const origin =
    binding.siteId === 'pku'
      ? 'https://mirrors.pku.edu.cn'
      : 'https://mirrors.tuna.tsinghua.edu.cn';
  return {
    kind: 'directory',
    bindingId,
    directory: `${origin}/${binding.rootPath}`,
    depth: 0,
    epoch,
    ruleRevision: rules.revision,
  };
}

it('子目录全部结束才汇总，两个源站独立完成，重复登记不重复等待', () => {
  const db = indexFixture();
  const lines: string[] = [];
  const progress = new IndexProgress(db, rules, (line) => lines.push(line));
  const pku = root('pku-nodejs');
  const tuna = root('tsinghua-nodejs');
  const child = { ...pku, directory: `${pku.directory}v24.1.0/`, depth: 1 };
  try {
    fixtureRun(db);
    progress.register([pku, tuna]);
    progress.register([child, child]);
    progress.finish(pku);
    expect(lines).toHaveLength(0);
    progress.finish(tuna);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[清华] Node.js 完成');
    progress.finish(child);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('[北京大学开源镜像站] Node.js 完成：1款软件，1条可用直链，2个任务');
    progress.finish(child);
    expect(lines).toHaveLength(2);
  } finally {
    db.close();
  }
});

it('同生态多个软件与官方清单合并，清单完成时不提前结束目录采集', () => {
  const db = indexFixture();
  const lines: string[] = [];
  const progress = new IndexProgress(db, rules, (line) => lines.push(line));
  const mini = root('tsinghua-miniconda');
  const anaconda = root('tsinghua-anaconda');
  const official: InstallerJob = { kind: 'official', epoch: 1, ruleRevision: rules.revision };
  try {
    progress.register([mini, anaconda, official]);
    progress.finish(official);
    expect(lines.some((line) => line.includes('Python / Conda'))).toBe(false);
    progress.finish(mini);
    expect(lines.some((line) => line.includes('Python / Conda'))).toBe(false);
    progress.finish(anaconda);
    expect(lines.filter((line) => line.includes('Python / Conda'))).toHaveLength(1);
    expect(lines.find((line) => line.includes('Python / Conda'))).toContain('3个任务');
  } finally {
    db.close();
  }
});

it('重试期间不报完成，最终失败汇总保旧，下一轮不混入上一轮', () => {
  const db = indexFixture();
  const lines: string[] = [];
  const progress = new IndexProgress(db, rules, (line) => lines.push(line));
  const job = root('pku-nodejs');
  try {
    fixtureRun(db);
    progress.register([job, root('pku-nodejs', 2)]);
    progress.finish(job, { retrying: true, error: 'HTTP 503' });
    expect(lines).toHaveLength(0);
    progress.finish(job, { error: 'HTTP 503' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('结束（有失败）');
    expect(lines[0]).toContain('1条可用直链');
    expect(lines[0]).toContain('失败1个，旧数据保留');
    expect(lines[0]).toContain('HTTP 503');
    progress.finish(root('pku-nodejs', 2));
    expect(lines).toHaveLength(2);
    expect(lines[1]).not.toContain('失败');
  } finally {
    db.close();
  }
});
