import type { DatabaseSync } from 'node:sqlite';
import { installerTaskKey, type InstallerJob } from './installers.js';
import type { RuleSet } from './rules/load.js';

interface Target {
  key: string;
  site: string;
  ecosystem: string;
}
interface Group extends Target {
  pending: ReadonlySet<string>;
  startedAt: number;
  completed: number;
  failed: number;
  retries: number;
  error?: string;
}

/** 只汇总日志；目录发布、下载记录及采集范围仍由原执行器管理。 */
export class IndexProgress {
  private groups = new Map<string, Group>();
  private readonly identities: Map<string, string>;
  private readonly sites: Map<string, string>;
  private readonly ecosystems: Map<string, string>;

  constructor(
    private readonly db: DatabaseSync,
    private readonly rules: RuleSet,
    private readonly log: (value: string) => void,
  ) {
    this.identities = new Map(
      rules.identities.map((identity) => [identity.slug, identity.ecosystemId]),
    );
    this.sites = new Map(
      (
        db.prepare('SELECT slug,name FROM catalog_sites').all() as Array<{
          slug: string;
          name: string;
        }>
      ).map((row) => [row.slug, row.name]),
    );
    this.ecosystems = new Map(
      (
        db.prepare('SELECT slug,label FROM catalog_ecosystems').all() as Array<{
          slug: string;
          label: string;
        }>
      ).map((row) => [row.slug, row.label]),
    );
  }

  private targets(job: InstallerJob): Target[] {
    if (job.kind === 'refresh') return [];
    const binding = job.kind === 'directory' ? this.rules.bindings.get(job.bindingId) : undefined;
    const site =
      job.kind === 'directory' ? binding?.siteId : job.kind === 'official' ? 'tsinghua' : 'pku';
    if (!site) return [];
    const software =
      job.kind === 'directory'
        ? (this.rules.rules.get(binding!.ruleId)?.softwareIds ?? [])
        : job.kind === 'official'
          ? (this.rules.officialCatalog?.bindings.map((entry) => entry.softwareId) ?? [])
          : this.rules.identities
              .filter((identity) => identity.repo === job.repoId)
              .map((identity) => identity.slug);
    const ecosystems = new Set(
      software.flatMap((slug) => {
        const ecosystem = this.identities.get(slug);
        return ecosystem ? [ecosystem] : [];
      }),
    );
    return [...ecosystems].map((ecosystem) => ({
      key: `${job.ruleRevision}:${job.epoch}:${site}:${ecosystem}`,
      site,
      ecosystem,
    }));
  }

  private store(group: Group) {
    this.groups = new Map([...this.groups, [group.key, group]]);
  }

  /** 批量入队之前登记全部根/子任务，避免快任务先结束而提前打印。 */
  register(jobs: readonly InstallerJob[]) {
    for (const job of jobs) {
      const task = installerTaskKey(job);
      for (const target of this.targets(job)) {
        const previous = this.groups.get(target.key);
        const group = previous ?? {
          ...target,
          pending: new Set<string>(),
          startedAt: Date.now(),
          completed: 0,
          failed: 0,
          retries: 0,
        };
        this.store({ ...group, pending: new Set([...group.pending, task]) });
      }
    }
  }

  finish(job: InstallerJob, result: { retrying?: boolean; error?: string } = {}) {
    const task = installerTaskKey(job);
    for (const target of this.targets(job)) {
      const previous = this.groups.get(target.key);
      if (!previous?.pending.has(task)) continue;
      if (result.retrying) {
        this.store({ ...previous, retries: previous.retries + 1 });
        continue;
      }
      const group: Group = {
        ...previous,
        pending: new Set([...previous.pending].filter((id) => id !== task)),
        completed: previous.completed + 1,
        failed: previous.failed + (result.error ? 1 : 0),
        error: previous.error ?? result.error,
      };
      if (group.pending.size > 0) this.store(group);
      else {
        this.groups = new Map([...this.groups].filter(([key]) => key !== target.key));
        this.report(group);
      }
    }
  }

  private report(group: Group) {
    const label = `[${this.sites.get(group.site) ?? group.site}] ${this.ecosystems.get(group.ecosystem) ?? group.ecosystem}`;
    try {
      // 按URL唯一的当前资源库计数，不把官方清单与目录重叠链接算两次。
      const counts = this.db
        .prepare(
          `SELECT COUNT(DISTINCT v.software_id) software,COUNT(*) files
        FROM catalog_downloads d JOIN catalog_versions v ON v.id=d.version_id
        JOIN catalog_software w ON w.id=v.software_id
        JOIN catalog_sites s ON s.id=d.site_id JOIN catalog_ecosystems e ON e.id=w.ecosystem_id
        WHERE s.slug=? AND e.slug=?`,
        )
        .get(group.site, group.ecosystem) as { software: number; files: number };
      const status = group.failed ? '结束（有失败）' : '完成';
      const retries = group.retries ? `，重试${group.retries}次` : '';
      const failed = group.failed
        ? `，失败${group.failed}个，旧数据保留；首个错误：${group.error}`
        : '';
      this.log(
        `${label} ${status}：${counts.software}款软件，${counts.files}条可用直链，${group.completed}个任务，用时${((Date.now() - group.startedAt) / 1000).toFixed(1)}s${retries}${failed}`,
      );
    } catch (error) {
      this.log(`${label} 汇总失败：${String(error)}`);
    }
  }
}
