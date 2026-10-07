import { createHash } from 'node:crypto';
import type { ResourceRegistry } from '../registry/types.ts';
import { searchLimits } from './limits.ts';
import { searchIndexSchema } from './model.ts';

/** 仅在构建/dev 使用；页面与端点共用同一公开投影及摘要算法。 */
export function createSearchSnapshot(registry: ResourceRegistry) {
  if (registry.mode !== 'public' || registry.resources.some((resource) => resource.metadata.draft)) {
    throw new Error('搜索索引只能由公开 Registry 生成');
  }
  const resources = registry.resources.map(({ metadata }) => ({
    id: metadata.id,
    name: metadata.name,
    summary: metadata.summary,
    category: metadata.category,
    aliases: metadata.aliases,
    tags: [...new Set(Object.values(metadata.tags).flatMap((values) => values ?? []))].toSorted(),
    ...(metadata.sortKey ? { sortKey: metadata.sortKey } : {}),
  })).toSorted((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const index = searchIndexSchema.parse({ schemaVersion: 1, resources });
  const text = JSON.stringify(index);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > searchLimits.indexBytes) {
    throw new Error(`公开搜索索引 ${bytes} 字节超过 ${searchLimits.indexBytes} 字节预算；请检查字段体积或评估分片`);
  }
  const hash = createHash('sha256').update(text, 'utf8').digest('hex');
  return Object.freeze({ hash, url: `/search-index/${hash}.json`, text, count: index.resources.length });
}
