import type { DatabaseSync } from 'node:sqlite';
import { sourceUrl } from './policy.js';
import type { Enqueue } from './jobs.js';

/** 采集得到的包名/索引入口是业务原料，不是文件清单或第二套任务队列。 */
export function rememberProjects(db: DatabaseSync, projects: { name: string; indexUrl: string }[]) {
  const insert = db.prepare(
    'INSERT INTO discovered_projects(resource_id,name,index_url) VALUES(?,?,?) ON CONFLICT(resource_id,name) DO UPDATE SET index_url=excluded.index_url',
  );
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const project of projects)
      insert.run(
        'pku:pypi',
        project.name,
        sourceUrl(project.indexUrl, 'https://mirrors.pku.edu.cn/pypi/web/simple/').href,
      );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** 包名游标只决定派发进度，队列成功接收后才推进；重试由BullMQ负责。 */
export async function dispatchProjects(db: DatabaseSync, after: string, enqueue: Enqueue) {
  const rows = db
    .prepare(
      'SELECT name,index_url FROM discovered_projects WHERE resource_id=? AND name>? ORDER BY name LIMIT 500',
    )
    .all('pku:pypi', after) as { name: string; index_url: string }[];
  if (!rows.length) return { cursor: '', discovered: 0 };
  await enqueue(
    rows.map((row) => ({
      kind: 'pypi-project',
      resourceId: 'pku:pypi',
      protocol: 'pypi',
      baseUrl: 'https://mirrors.pku.edu.cn/pypi/',
      indexUrl: row.index_url,
      component: row.name,
      discoveryEpoch: Date.now(),
    })),
  );
  return { cursor: rows.at(-1)!.name, discovered: rows.length };
}
