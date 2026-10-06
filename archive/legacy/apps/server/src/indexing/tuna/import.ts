//将结果暂存并事务发布到 SQLite。不逐条访问下载链接，不下载安装包。
import type { DatabaseSync } from 'node:sqlite';
import { beginRun, failRun, publishRun, stageDownloads } from '../../db/installers.js';
import { recordPending, resolvePending } from '../rules/pending.js';
import type { RuleSet } from '../rules/load.js';
import type { SourceClient } from '../source.js';
import { parseTunaCatalog, TUNA_CATALOG_URL, TUNA_ORIGIN } from './catalog.js';

/** 一次有界JSON请求完成整批发现；网络与解析全部成功后才原子发布。 */
export async function importTunaCatalog(
  db: DatabaseSync,
  epoch: number,
  source: SourceClient,
  rules: RuleSet,
) {
  const requests = source.requests,
    bytes = source.bytes;
  const parsed = parseTunaCatalog(await source.json(TUNA_CATALOG_URL), rules);
  const softwareIds = [...new Set(parsed.downloads.map((d) => d.software))];
  const runs: Array<{ software: string; run: number }> = [];
  try {
    for (const software of softwareIds) {
      const run = beginRun(
        db,
        'tsinghua',
        software,
        `${TUNA_ORIGIN}/`,
        epoch,
        Date.now(),
        rules.revision,
        'official',
      );
      runs.push({ software, run });
      stageDownloads(
        db,
        run,
        parsed.downloads.filter((d) => d.software === software).map((d) => d.download),
      );
    }
    const pendingUrls = parsed.issues
      .filter((issue) => issue.decision === 'pending')
      .map((issue) => issue.url);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const { software, run } of runs) {
        // 归属由已有来源关联决定；上游改分组名时不能误删暂时无法映射的既有直链。
        publishRun(db, run, Date.now(), undefined, pendingUrls);
        const accepted = parsed.downloads.filter((d) => d.software === software).length;
        db.prepare('UPDATE catalog_runs SET requests=?,network_bytes=?,stats=? WHERE id=?').run(
          source.requests - requests,
          source.bytes - bytes,
          JSON.stringify({ ...parsed.stats, software, accepted }),
          run,
        );
      }
      const settled = new Set([
        ...parsed.downloads.map((d) => d.download.url),
        ...parsed.issues.filter((i) => i.decision === 'rejected').map((i) => i.url),
      ]);
      resolvePending(db, 'tsinghua-official', TUNA_CATALOG_URL, settled);
      for (const issue of parsed.issues.filter((i) => i.decision === 'pending'))
        recordPending(
          db,
          'tsinghua-official',
          issue.reason,
          TUNA_CATALOG_URL,
          issue.url,
          rules.revision,
        );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { files: parsed.downloads.length, software: runs.length, ...parsed.stats };
  } catch (error) {
    for (const { run } of runs) failRun(db, run, error);
    throw error;
  }
}
