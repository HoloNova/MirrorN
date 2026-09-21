import type { Mirror } from '@mirrorn/shared';

import type { Catalog } from './ecosystems';
import { MIRROR_KIND_LABELS } from './mirrorKind';

/**
 * 「站点」模块的行模型。
 *
 * 为什么单独一层：站点的信息分散在两处数据里——站点自身在 `data/mirrors.json`，
 * 它提供哪些仓库在各生态的 `supports` 里。合并、排序与筛选做成纯函数，页面只渲染，
 * 这样不挂载组件也能测（界面行为按项目规则不做自动化测试）。
 */

export interface SiteEcosystemLink {
  id: string;
  name: string;
  repositoryUrl: string;
  supportsPublish: boolean;
  /** 数据里为该生态声明的上游作业名；声明了才能把上游状态文件映射到生态（见 packages/shared/src/sync）。 */
  statusJob?: string;
}

export interface SiteSource {
  url: string;
  checkedAt?: string;
  note?: string;
}

export interface SiteRow {
  id: string;
  name: string;
  kind: Mirror['kind'];
  kindLabel: string;
  homepageUrl: string;
  /** 探针实际请求的地址；没有探针的站点为空。 */
  probeUrl?: string;
  /** 上游状态文件的地址；没有声明状态源的站点为空。 */
  statusUrl?: string;
  /** 站点主页之外的核对来源（我们据以填写数据的页面）。 */
  sources: SiteSource[];
  /** 数据里是否声明了探针：没有探针的站点在界面上不显示测量入口。 */
  hasProbe: boolean;
  /** 别名（例如「清华」「tuna」），参与站点页的筛选。 */
  aliases: string[];
  /** 该站点提供仓库地址的生态。 */
  ecosystems: SiteEcosystemLink[];
}

export function listSiteRows(catalog: Catalog): SiteRow[] {
  const links = new Map<string, SiteEcosystemLink[]>();
  for (const ecosystem of catalog.ecosystems) {
    for (const support of ecosystem.supports) {
      const list = links.get(support.mirrorId) ?? [];
      list.push({
        id: ecosystem.id,
        name: ecosystem.name,
        repositoryUrl: support.repositoryUrl,
        supportsPublish: support.supportsPublish,
        ...(support.statusJob === undefined ? {} : { statusJob: support.statusJob }),
      });
      links.set(support.mirrorId, list);
    }
  }

  return catalog.mirrors
    .map((mirror) => ({
      id: mirror.id,
      name: mirror.name,
      kind: mirror.kind,
      kindLabel: MIRROR_KIND_LABELS[mirror.kind],
      homepageUrl: mirror.homepageUrl,
      ...(mirror.probe === undefined ? {} : { probeUrl: mirror.probe.url }),
      ...(mirror.statusSource === undefined ? {} : { statusUrl: mirror.statusSource.url }),
      sources: mirror.sources.map((source) => ({
        url: source.url,
        checkedAt: source.checkedAt,
        ...(source.note === undefined ? {} : { note: source.note }),
      })),
      hasProbe: mirror.probe !== undefined,
      aliases: mirror.aliases,
      ecosystems: links.get(mirror.id) ?? [],
    }))
    .sort(
      (left, right) =>
        // 覆盖生态多的排前面：一次换源能解释更多命令，这是比字母序更有用的顺序。
        right.ecosystems.length - left.ecosystems.length ||
        left.name.localeCompare(right.name, 'zh'),
    );
}

/** 按 id 取一行；找不到返回 undefined（页面据此显示"没有这个站点"）。 */
export function findSiteRow(rows: SiteRow[], id: string): SiteRow | undefined {
  return rows.find((row) => row.id === id);
}

/**
 * 站点筛选：匹配站点名、别名、类别、主页、以及它覆盖的生态名与仓库地址。
 * 便于用户用「清华」「tuna」「pypi」「高校」任一种说法找到同一行。
 */
export function matchesSiteQuery(row: SiteRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return true;
  }

  const haystack = [
    row.name,
    row.id,
    row.kindLabel,
    row.homepageUrl,
    ...row.aliases,
    ...row.ecosystems.flatMap((link) => [link.name, link.id, link.repositoryUrl]),
  ];

  return haystack.some((value) => value.toLowerCase().includes(needle));
}
