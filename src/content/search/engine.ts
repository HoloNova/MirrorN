import Fuse, { type IFuseOptions } from 'fuse.js';
import { searchIndexSchema, type SearchRecord } from './model.ts';
import { searchLimits } from './limits.ts';
import { normalizeQuery, normalizeSearchText } from './query.ts';

interface SearchEntry {
  readonly record: SearchRecord;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly summary: string;
  readonly tags: readonly string[];
  readonly sortKey: string;
}
interface Candidate { readonly entry: SearchEntry; readonly score: number }

const fuseOptions: IFuseOptions<SearchEntry> = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.35,
  keys: [
    { name: 'name', weight: 0.5 },
    { name: 'aliases', weight: 0.25 },
    { name: 'sortKey', weight: 0.12 },
    { name: 'tags', weight: 0.08 },
    { name: 'summary', weight: 0.05 },
  ],
};

function exactRank(entry: SearchEntry, query: string): number {
  if (entry.name === query) return 0;
  if (entry.aliases.includes(query)) return 1;
  return 2;
}
function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

/** 精确候选不受 Fuse 阈值/限额截断；最后才截取固定数量。 */
function rankCandidates(candidates: readonly Candidate[], query: string): readonly SearchRecord[] {
  return Object.freeze(candidates.toSorted((a, b) =>
    exactRank(a.entry, query) - exactRank(b.entry, query)
    || a.score - b.score
    || compareText(a.entry.sortKey, b.entry.sortKey)
    || compareText(a.entry.record.id, b.entry.record.id),
  ).slice(0, searchLimits.resultCount).map(({ entry }) => entry.record));
}

/** 唯一动态加载入口；不暴露 Fuse 的可变 add/remove/setCollection 方法。 */
export function createSearchEngine(input: unknown) {
  const index = searchIndexSchema.parse(input);
  const entries: readonly SearchEntry[] = Object.freeze(index.resources.map((record) => Object.freeze({
    record,
    name: normalizeSearchText(record.name),
    aliases: Object.freeze(record.aliases.map(normalizeSearchText)),
    summary: normalizeSearchText(record.summary),
    tags: Object.freeze(record.tags.map(normalizeSearchText)),
    sortKey: normalizeSearchText(record.sortKey ?? record.name),
  })));
  const fuse = new Fuse(entries, fuseOptions);
  return Object.freeze({
    count: entries.length,
    search(value: string): readonly SearchRecord[] {
      const query = normalizeQuery(value);
      if (!query) return Object.freeze([]);
      const fuzzy = fuse.search(query).map(({ item: entry, score }) => ({ entry, score: score ?? 1 }));
      const exact = entries.filter((entry) => exactRank(entry, query) < 2).map((entry) => ({ entry, score: 0 }));
      const candidates = [...new Map([...fuzzy, ...exact].map((candidate) => [candidate.entry.record.id, candidate])).values()];
      return rankCandidates(candidates, query);
    },
  });
}

export type SearchEngine = ReturnType<typeof createSearchEngine>;
