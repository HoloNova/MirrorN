import type { ProbeTarget } from '@mirrorn/shared/probe';

import { toProbeTargets } from '../composables/useMirrorProbes';
import type { Catalog } from './ecosystems';

/**
 * 首页"测量我的网络"的候选来源。
 *
 * 规则（数据驱动，不在页面里写死站点名字）：
 *   1. 只有数据里声明了探针的来源才可能被测量——否则界面会出现永远"无法测量"的行；
 *   2. 优先取**被多个生态共用**的来源：一次测量能解释更多页面的推荐结果；
 *   3. 同分按 id 排序，保证同样的数据永远给出同一批候选（否则每次刷新首页列出的来源会变）。
 *
 * 数量上限很小是刻意的：首页那一次测量是用户主动点击后才发生的，不该变成对一堆站点的并发探测。
 */
export function pickHomeMeasureTargets(catalog: Catalog, limit = 4): ProbeTarget[] {
  const ecosystemCounts = new Map<string, number>();
  for (const ecosystem of catalog.ecosystems) {
    for (const support of ecosystem.supports) {
      ecosystemCounts.set(support.mirrorId, (ecosystemCounts.get(support.mirrorId) ?? 0) + 1);
    }
  }

  const ranked = catalog.mirrors
    .filter((mirror) => mirror.probe !== undefined)
    .map((mirror) => ({
      mirror,
      ecosystems: ecosystemCounts.get(mirror.id) ?? 0,
    }))
    .sort((left, right) => {
      if (left.ecosystems !== right.ecosystems) {
        return right.ecosystems - left.ecosystems;
      }
      return left.mirror.id < right.mirror.id ? -1 : left.mirror.id > right.mirror.id ? 1 : 0;
    });

  return toProbeTargets(ranked.slice(0, limit).map((entry) => entry.mirror));
}
