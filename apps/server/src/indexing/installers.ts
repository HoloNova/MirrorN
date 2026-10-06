import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  beginRun,
  failRun,
  publishRun,
  stageDownloads,
  registerSoftware,
  registerSoftwareSite,
  type Download,
} from '../db/installers.js';
import { PKU_ORIGIN, resourceSite } from './policy.js';
import { directoryEntries as entries } from './directory.js';
import { SourceClient, SourceError } from './source.js';
import { loadDownloadRules, type RuleSet } from './rules/load.js';
import { classifyFile } from './rules/classify.js';
import { bindingDirectory, directoryDecision } from './rules/templates.js';
import { recordPending, prunePending, resolvePending } from './rules/pending.js';
import { compareRepoVersions } from './versions.js';

export type InstallerJob =
  | { kind: 'refresh'; ruleRevision: string }
  | { kind: 'inventory'; repoId: 'apache'; epoch: number; ruleRevision: string }
  | {
      kind: 'directory';
      bindingId: string;
      directory: string;
      epoch: number;
      depth: number;
      ruleRevision: string;
    };
export type InstallerEnqueue = (jobs: InstallerJob[]) => Promise<void>;
export function registerInstallers(db: DatabaseSync, set: RuleSet) {
  for (const identity of set.identities) {
    const category = (
      db
        .prepare('SELECT category FROM catalog_ecosystems WHERE slug=?')
        .get(identity.ecosystemId) as { category: string } | undefined
    )?.category;
    if (!category) throw new SourceError(`生态未登记：${identity.ecosystemId}`, false);
    registerSoftware(db, {
      ...identity,
      category,
      kind: [...set.rules.values()]
        .filter((rule) => rule.softwareIds.includes(identity.slug))
        .every((rule) => rule.matches.every((match) => match.purpose === 'system_image'))
        ? 'iso'
        : 'installer',
    });
  }
  for (const binding of set.bindings.values())
    for (const software of set.rules.get(binding.ruleId)!.softwareIds)
      registerSoftwareSite(db, binding.siteId, software);
}
export function installerTaskKey(job: InstallerJob): string {
  return createHash('sha256').update(JSON.stringify(job)).digest('hex');
}
export { directoryApi } from './directory.js';
/** 查询不调用这个执行器；所有源站请求只由后台任务执行。 */
export async function executeInstallerJob(
  db: DatabaseSync,
  job: InstallerJob,
  source: SourceClient,
  enqueue: InstallerEnqueue,
  set: RuleSet = loadDownloadRules(),
) {
  if (job.ruleRevision !== set.revision)
    throw new SourceError('旧规则待办已过期，由启动刷新重新发现', false);
  if (job.kind === 'refresh') {
    const epoch = Date.now();
    registerInstallers(db, set);
    prunePending(db, epoch);
    db.prepare("DELETE FROM catalog_runs WHERE state<>'staging' AND finished_at<?").run(
      epoch - 7 * 86400000,
    );
    const jobs: InstallerJob[] = set.active.map((binding) => ({
      kind: 'directory',
      bindingId: binding.id,
      directory: `${resourceSite(binding.siteId).origin}/${binding.rootPath}`,
      epoch,
      depth: 0,
      ruleRevision: set.revision,
    }));
    jobs.push({ kind: 'inventory', repoId: 'apache', epoch, ruleRevision: set.revision });
    await enqueue(jobs);
    return { discovered: jobs.length };
  }
  if (job.kind === 'inventory') {
    const directory = `${PKU_ORIGIN}/apache/`;
    const listing = await entries(source, directory);
    if (!listing.length) throw new SourceError('Apache目录异常为空', true);
    let pending = 0,
      overflow = 0;
    for (const entry of listing)
      if (
        entry.type === 'directory' &&
        !set.active.some(
          (binding) =>
            binding.siteId === 'pku' &&
            binding.repoId === 'apache' &&
            binding.rootPath.startsWith(`apache/${entry.name}/`),
        )
      ) {
        pending++;
        if (
          !recordPending(
            db,
            'pku-apache-inventory',
            'unadapted_project',
            directory,
            entry.name,
            set.revision,
          )
        )
          overflow++;
      }
    return { pending, overflow };
  }
  const binding = set.bindings.get(job.bindingId);
  const rule = binding && set.rules.get(binding.ruleId);
  if (!binding || !rule || rule.status !== 'active') throw new SourceError('采集规则未启用', false);
  const { url, relative } = bindingDirectory(binding, job.directory);
  if (relative.split('/').filter(Boolean).length !== job.depth || job.depth > binding.steps.length)
    throw new SourceError('软件目录深度异常', false);
  for (const software of rule.softwareIds) {
    if (
      job.depth > 0 &&
      !db
        .prepare(
          `SELECT 1 FROM catalog_scopes s JOIN catalog_software w ON w.id=s.software_id JOIN catalog_sites t ON t.id=s.site_id WHERE w.slug=? AND t.slug=? AND s.directory=? AND s.enabled=1 AND s.discovered_epoch=?`,
        )
        .get(software, binding.siteId, url.href, job.epoch)
    )
      throw new SourceError('子目录未被当前有效父目录确认，不执行遗留待办', false);
  }
  const runs = rule.softwareIds.map((software) => ({
    software,
    run: beginRun(db, binding.siteId, software, url.href, job.epoch, Date.now(), set.revision),
  }));
  const beforeRequests = source.requests,
    beforeBytes = source.bytes;
  try {
    const listing = await entries(source, url.href);
    if (!listing.length) throw new SourceError('软件目录异常为空，保留有效数据', true);
    const names = listing.filter((entry) => entry.type !== 'directory').map((entry) => entry.name);
    const next: InstallerJob[] = [],
      retainedUrls: string[] = [],
      presentDirectories = new Set<string>(),
      classifiedNames = new Set<string>();
    const files = new Map<string, Download[]>();
    const stats = { accepted: 0, rejected: 0, pending: 0, pendingDirectories: 0, overflow: 0 };
    for (const entry of listing) {
      if (entry.type === 'directory') {
        const child = `${url.href}${encodeURIComponent(entry.name)}/`;
        presentDirectories.add(child);
        const decision = directoryDecision(binding, url.href, job.depth, entry.name);
        if (decision === 'descend') next.push({ ...job, directory: child, depth: job.depth + 1 });
        else if (decision === 'pending') {
          stats.pendingDirectories++;
          if (
            !recordPending(
              db,
              binding.id,
              'unrecognized_directory',
              url.href,
              entry.name,
              set.revision,
            )
          )
            stats.overflow++;
        } else stats.rejected++;
        if (decision !== 'pending') classifiedNames.add(entry.name);
        continue;
      }
      const fileUrl = `${url.href}${encodeURIComponent(entry.name)}`;
      const result = classifyFile(set, binding, url.href, entry.name, names);
      if (result.decision === 'accepted') {
        const downloads = files.get(result.software) ?? [];
        downloads.push({
          ...result.download,
          filename: entry.name,
          url: fileUrl,
          ...(entry.size === undefined ? {} : { size: entry.size }),
          ...(entry.sizeEstimated
            ? { metadata: { ...result.download.metadata, sizeEstimated: true } }
            : {}),
        });
        files.set(result.software, downloads);
        stats.accepted++;
        classifiedNames.add(entry.name);
      } else if (result.decision === 'pending') {
        stats.pending++;
        retainedUrls.push(fileUrl);
        if (!recordPending(db, binding.id, result.reason, url.href, entry.name, set.revision))
          stats.overflow++;
      } else {
        stats.rejected++;
        classifiedNames.add(entry.name);
      }
    }
    next.sort((a, b) =>
      a.kind === 'directory' && b.kind === 'directory'
        ? compareRepoVersions(
            binding.repoId,
            b.directory.split('/').at(-2)!,
            a.directory.split('/').at(-2)!,
          )
        : 0,
    );
    for (const { software, run } of runs) stageDownloads(db, run, files.get(software) ?? []);
    // Redis持久化成功之前不能公布父目录；完整原清单与过滤后的下一步任务是两回事。
    await enqueue(next);
    db.exec('BEGIN IMMEDIATE');
    let count = 0;
    try {
      for (const { run } of runs) {
        const previous = db
          .prepare(
            `SELECT child.directory FROM catalog_scopes child JOIN catalog_runs r ON r.scope_id=child.parent_id WHERE r.id=? AND child.enabled=1`,
          )
          .all(run) as { directory: string }[];
        const keep = new Set(
          next.map((child) => (child as Extract<InstallerJob, { kind: 'directory' }>).directory),
        );
        for (const old of previous)
          if (
            presentDirectories.has(old.directory) ||
            (next.length === 0 &&
              stats.accepted === 0 &&
              (stats.pending > 0 || stats.pendingDirectories > 0))
          )
            keep.add(old.directory);
        count += publishRun(db, run, Date.now(), [...keep], retainedUrls);
        db.prepare('UPDATE catalog_runs SET requests=?,network_bytes=?,stats=? WHERE id=?').run(
          source.requests - beforeRequests,
          source.bytes - beforeBytes,
          JSON.stringify(stats),
          run,
        );
      }
      resolvePending(db, binding.id, url.href, classifiedNames);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { files: count, discovered: next.length, ...stats };
  } catch (error) {
    for (const { run } of runs) failRun(db, run, error);
    throw error;
  }
}
