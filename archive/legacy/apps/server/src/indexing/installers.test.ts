import { describe, it, expect, vi } from 'vitest';
import { executeInstallerJob, type InstallerJob } from './installers.js';
import { SourceClient, SourceError } from './source.js';
import { loadDownloadRules } from './rules/load.js';
import { indexFixture, fixtureRun, fixtureDownload } from '../db/indexFixture.js';
import { getResource, searchResources, listEcosystems } from '../db/catalog.js';
import { queryFiles, queryFileOptions } from '../db/fileQueries.js';
import { registerSoftware } from '../db/installers.js';
const rules = loadDownloadRules();
const root = 'https://mirrors.pku.edu.cn/nodejs-release/';
const task: Extract<InstallerJob, { kind: 'directory' }> = {
  kind: 'directory',
  bindingId: 'pku-nodejs',
  directory: root,
  epoch: 1,
  depth: 0,
  ruleRevision: rules.revision,
};
function source(data: unknown | ((url: string) => unknown)) {
  const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
    Response.json(typeof data === 'function' ? data(String(url)) : data),
  );
  return { client: new SourceClient(fetchImpl), fetchImpl };
}
async function parent(db: ReturnType<typeof indexFixture>, epoch = 1) {
  const next: InstallerJob[] = [];
  await executeInstallerJob(
    db,
    { ...task, epoch },
    source([{ name: 'v24.1.0', type: 'directory' }]).client,
    async (jobs) => {
      next.push(...jobs);
    },
    rules,
  );
  return next[0] as Extract<InstallerJob, { kind: 'directory' }>;
}
const file = (name = fixtureDownload().filename) => ({ name, type: 'other', size: 100 });
describe('后台规则任务的完整范围更新', () => {
  it('启动刷新遍历已启用绑定，不判断数据过期，不采集停用规则', async () => {
    const db = indexFixture();
    fixtureRun(db);
    const s = source([]),
      first: InstallerJob[] = [],
      second: InstallerJob[] = [];
    try {
      await executeInstallerJob(
        db,
        { kind: 'refresh', ruleRevision: rules.revision },
        s.client,
        async (j) => {
          first.push(...j);
        },
        rules,
      );
      await executeInstallerJob(
        db,
        { kind: 'refresh', ruleRevision: rules.revision },
        s.client,
        async (j) => {
          second.push(...j);
        },
        rules,
      );
      expect(first.filter((j) => j.kind === 'directory')).toHaveLength(29);
      expect(second.filter((j) => j.kind === 'directory')).toHaveLength(29);
      expect(first.some((j) => j.kind === 'directory' && j.bindingId === 'tsinghua-nodejs')).toBe(
        true,
      );
      expect(first.every((j) => j.ruleRevision === rules.revision)).toBe(true);
      expect(first.some((j) => j.kind === 'directory' && j.bindingId === 'pku-spark')).toBe(false);
      expect(s.fetchImpl).not.toHaveBeenCalled();
      // 身份登记不提前暴露零下载生态；这里只发布了Node.js。
      expect(listEcosystems(db).map((ecosystem) => ecosystem.id)).toEqual(['nodejs']);
    } finally {
      db.close();
    }
  });
  it('正常识别新版本，仅从源目录动态产生直链，不导入研究样本', async () => {
    const db = indexFixture();
    try {
      const job = await parent(db);
      const s = source([file()]);
      const result = await executeInstallerJob(db, job, s.client, async () => {}, rules);
      expect('files' in result && result.files).toBe(1);
      const page = queryFiles(db, { resource: 'pku:nodejs-release' });
      expect(page.items[0]?.url).toBe(fixtureDownload().url);
      expect(page.items[0]?.metadata.ruleRevision).toBe(rules.revision);
      expect(searchResources(db, { ecosystemId: 'nodejs', downloadableOnly: true })).toHaveLength(
        1,
      );
    } finally {
      db.close();
    }
  });
  it('采集失败、异常空清单保旧且清理暂存', async () => {
    const db = indexFixture();
    try {
      const job = await parent(db);
      fixtureRun(db, [fixtureDownload()], 1);
      await expect(
        executeInstallerJob(db, job, source([]).client, async () => {}, rules),
      ).rejects.toThrow('异常为空');
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(1);
      expect((db.prepare('SELECT COUNT(*) n FROM catalog_staged').get() as { n: number }).n).toBe(
        0,
      );
    } finally {
      db.close();
    }
  });
  it('源站仍有旧文件而规则未识别，保留旧下载并登记有限候选', async () => {
    const db = indexFixture();
    try {
      const job = await parent(db);
      fixtureRun(db, [fixtureDownload('unknown-release.exe')], 1);
      const result = await executeInstallerJob(
        db,
        job,
        source([file('unknown-release.exe')]).client,
        async () => {},
        rules,
      );
      expect('pending' in result && result.pending).toBe(1);
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items[0]?.filename).toBe(
        'unknown-release.exe',
      );
      expect((db.prepare('SELECT COUNT(*) n FROM catalog_pending').get() as { n: number }).n).toBe(
        1,
      );
    } finally {
      db.close();
    }
  });
  it('源站旧链接消失与明确排除不是未知；完整新清单替换对应范围', async () => {
    const db = indexFixture();
    try {
      const job = await parent(db);
      fixtureRun(db, [fixtureDownload()], 1);
      await executeInstallerJob(
        db,
        job,
        source([file('node-v24.1.0-arm64.msi'), file('node-v24.1.0-headers.tar.gz')]).client,
        async () => {},
        rules,
      );
      expect(
        queryFiles(db, { resource: 'pku:nodejs-release' }).items.map((r) => r.filename),
      ).toEqual(['node-v24.1.0-arm64.msi']);
    } finally {
      db.close();
    }
  });
  it('未知或被新目录规则漏选的现存目录不会撤销整个旧子树', async () => {
    const db = indexFixture();
    try {
      const job = await parent(db);
      await executeInstallerJob(db, job, source([file()]).client, async () => {}, rules);
      const changed = { ...rules, bindings: new Map(rules.bindings) };
      changed.bindings.set('pku-nodejs', {
        ...rules.bindings.get('pku-nodejs')!,
        steps: ['^v99\\.0\\.0$'],
      });
      await executeInstallerJob(
        db,
        { ...task, epoch: 2 },
        source([{ name: 'v24.1.0', type: 'directory' }]).client,
        async () => {},
        changed,
      );
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it('完整清单确认旧子目录消失后撤销；旧子任务不能再激活它', async () => {
    const db = indexFixture();
    try {
      const job = await parent(db);
      await executeInstallerJob(db, job, source([file()]).client, async () => {}, rules);
      await executeInstallerJob(
        db,
        { ...task, epoch: 2 },
        source([{ name: 'v25.0.0', type: 'directory' }]).client,
        async () => {},
        rules,
      );
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(0);
      const s = source([file()]);
      await expect(executeInstallerJob(db, job, s.client, async () => {}, rules)).rejects.toThrow(
        '当前有效父目录',
      );
      expect(s.fetchImpl).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
  it('Redis未确认下一步待办时，不公布父目录及撤销旧子目录', async () => {
    const db = indexFixture();
    try {
      const job = await parent(db);
      await executeInstallerJob(db, job, source([file()]).client, async () => {}, rules);
      await expect(
        executeInstallerJob(
          db,
          { ...task, epoch: 2 },
          source([{ name: 'v25.0.0', type: 'directory' }]).client,
          async () => {
            throw new Error('Redis不可用');
          },
          rules,
        ),
      ).rejects.toThrow('Redis不可用');
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it('过期规则任务、未审核入口和重复文件条目都拒绝，不用新规则清旧数据', async () => {
    const db = indexFixture();
    try {
      const s = source([file()]);
      await expect(
        executeInstallerJob(db, { ...task, ruleRevision: 'old' }, s.client, async () => {}, rules),
      ).rejects.toThrow('旧规则');
      await expect(
        executeInstallerJob(
          db,
          { ...task, directory: 'https://mirrors.ustc.edu.cn/nodejs/' },
          s.client,
          async () => {},
          rules,
        ),
      ).rejects.toThrow('允许范围');
      expect(s.fetchImpl).not.toHaveBeenCalled();
      await expect(
        executeInstallerJob(db, task, source([file(), file()]).client, async () => {}, rules),
      ).rejects.toThrow('唯一性');
    } finally {
      db.close();
    }
  });
  it('正常无候选不作为网络失败重试，只有下载计数大幅减少才拦截更新', async () => {
    const db = indexFixture();
    try {
      const result = await executeInstallerJob(
        db,
        task,
        source([{ name: 'README', type: 'file' }]).client,
        async () => {},
        rules,
      );
      expect('files' in result && result.files).toBe(0);
      const job = await parent(db);
      fixtureRun(
        db,
        Array.from({ length: 4 }, (_, i) => fixtureDownload(`old-${i}.msi`)),
        1,
      );
      await expect(
        executeInstallerJob(db, job, source([file()]).client, async () => {}, rules),
      ).rejects.toThrow('突降');
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(4);
    } finally {
      db.close();
    }
  });
  it('未知项目仅积累候选，不自动生成Apache软件身份', async () => {
    const db = indexFixture();
    const before = searchResources(db).length;
    try {
      await executeInstallerJob(
        db,
        { kind: 'inventory', repoId: 'apache', epoch: 1, ruleRevision: rules.revision },
        source([
          { name: 'new-project', type: 'directory' },
          { name: 'kafka', type: 'directory' },
        ]).client,
        async () => {},
        rules,
      );
      expect(searchResources(db).length).toBe(before);
      expect((db.prepare('SELECT COUNT(*) n FROM catalog_pending').get() as { n: number }).n).toBe(
        1,
      );
    } finally {
      db.close();
    }
  });
  it('多系统文件只保存一份，Unix安装器不能由Windows筛选取得', async () => {
    const db = indexFixture();
    try {
      const binding = rules.bindings.get('pku-texlive')!;
      await executeInstallerJob(
        db,
        {
          ...task,
          bindingId: binding.id,
          directory: `https://mirrors.pku.edu.cn/${binding.rootPath}`,
        },
        source([
          { name: 'TEXLIVE_2026', type: 'file' },
          file('install-tl-unx.tar.gz'),
          file('install-tl-windows.exe'),
        ]).client,
        async () => {},
        rules,
      );
      expect(
        queryFiles(db, { resource: 'pku:texlive', platform: 'macos' }).items.map((f) => f.filename),
      ).toEqual(['install-tl-unx.tar.gz']);
      expect(
        queryFiles(db, { resource: 'pku:texlive', platform: 'windows' }).items.map(
          (f) => f.filename,
        ),
      ).toEqual(['install-tl-windows.exe']);
      expect(queryFileOptions(db, { resource: 'pku:texlive' }).platforms.sort()).toEqual([
        'linux',
        'macos',
        'windows',
      ]);
      expect(getResource(db, 'pku:texlive')?.artifactCount).toBe(2);
    } finally {
      db.close();
    }
  });
  it('已有URL的跨软件归属冲突不能覆盖，查询也不需要规则或源站', async () => {
    const db = indexFixture();
    try {
      fixtureRun(db);
      registerSoftware(db, {
        slug: 'another',
        resourceKey: 'another',
        name: 'Another',
        aliases: [],
        category: 'language',
        repo: 'nodejs-release',
        ecosystemId: 'nodejs',
      });
      const s = source([file()]);
      const customRule = { ...rules.rules.get('nodejs')!, softwareIds: ['another'] };
      const custom = { ...rules, rules: new Map([...rules.rules, ['nodejs', customRule]]) };
      const job = await parent(db);
      await expect(executeInstallerJob(db, job, s.client, async () => {}, custom)).rejects.toThrow(
        '子目录未被当前',
      );
      expect(queryFiles(db, { resource: 'pku:nodejs-release' }).items).toHaveLength(1);
      expect(s.fetchImpl).not.toHaveBeenCalled();
      expect(new SourceError('old', false).retryable).toBe(false);
    } finally {
      db.close();
    }
  });
});
