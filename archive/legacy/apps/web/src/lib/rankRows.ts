import type { ProbeViewInput } from './probeView';

/**
 * 排名表一行的数据形状。
 *
 * 单独成文件而不是写在组件里：`<script setup>` 不能导出 ES 模块成员，而首页与生态文档
 * 都要构造这个形状（并且都按耗时排序），所以类型与排序规则放在这一层。
 *
 * 同步状态是可选的：它是**按生态**分开的（同一站点在不同生态上是不同的上游作业），
 * 只有知道用户要配哪个生态的页面（生态文档）才传它。
 */
export interface RankRow {
  id: string;
  name: string;
  kindLabel: string;
  view: ProbeViewInput;
  recommended: boolean;
  sync?: { text: string; detail?: string; tone: 'ok' | 'pending' | 'bad' | 'muted' };
}

/**
 * 本轮耗时（毫秒）。测不到、超时、没有探针的一律排到最后：
 * 用 `Infinity` 而不是 0，因为“0 ms”是比任何来源都快的假事实。
 */
export function latencyOf(view: ProbeViewInput): number {
  return view.result?.status === 'ok'
    ? (view.result.durationMs ?? Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY;
}

/** 按耗时升序；同耗时按名称排序，保证同样的数据永远给出同一个顺序。 */
export function sortByLatency<T extends { view: ProbeViewInput; name: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      latencyOf(left.view) - latencyOf(right.view) || left.name.localeCompare(right.name, 'zh'),
  );
}
