import Fuse from 'fuse.js';

import type { Ecosystem, Mirror } from '@mirrorn/shared';

import type { Catalog } from './ecosystems';

/** 结果数量上限：先给一个够用的列表，等真实需求出现再做分页。 */
export const MAX_RESULTS = 8;

/**
 * 语言层面的意图词，适用于所有生态，因此放在代码里而不是每个生态的数据里。
 * 生态自身的身份别名（python / pip / 装python）仍然写在 data/ 中，由社区 PR 维护。
 */
const ECOSYSTEM_INTENTS = [
  '换源',
  'huanyuan',
  '镜像',
  'jingxiang',
  '镜像源',
  '源',
  '加速',
  'jiasu',
  'mirror',
  'registry',
];

export interface EcosystemHit {
  kind: 'ecosystem';
  id: string;
  ecosystemId: string;
  title: string;
  subtitle: string;
  matchedTerms: string[];
}

export interface MirrorHit {
  kind: 'mirror';
  id: string;
  mirrorId: string;
  title: string;
  subtitle: string;
  matchedTerms: string[];
  /** 该镜像在本地数据中实际支持的生态，用于给出可点击的下一步。 */
  ecosystemIds: string[];
}

export type SearchHit = EcosystemHit | MirrorHit;

interface IndexedDocument {
  id: string;
  kind: 'ecosystem' | 'mirror';
  title: string;
  subtitle: string;
  terms: string[];
  ecosystemId?: string;
  mirrorId?: string;
  ecosystemIds?: string[];
}

export interface SearchIndex {
  search: (query: string) => SearchHit[];
  isEmpty: boolean;
}

function toEcosystemDocument(ecosystem: Ecosystem): IndexedDocument {
  return {
    id: `ecosystem:${ecosystem.id}`,
    kind: 'ecosystem',
    title: ecosystem.name,
    subtitle: ecosystem.description,
    terms: [ecosystem.name, ecosystem.packageManager, ...ecosystem.aliases, ...ECOSYSTEM_INTENTS],
    ecosystemId: ecosystem.id,
  };
}

function toMirrorDocument(
  mirror: Mirror,
  supportedEcosystems: Ecosystem[],
): IndexedDocument | undefined {
  // 没有对应生态的镜像不产生结果卡片：列表里的每一项都必须能点进下一步。
  if (supportedEcosystems.length === 0) {
    return undefined;
  }

  return {
    id: `mirror:${mirror.id}`,
    kind: 'mirror',
    title: mirror.name,
    subtitle: `支持 ${supportedEcosystems.map((ecosystem) => ecosystem.name).join('、')}`,
    terms: [
      mirror.name,
      ...mirror.aliases,
      ...supportedEcosystems.flatMap((ecosystem) => [
        ecosystem.name,
        ecosystem.packageManager,
        ...ecosystem.aliases,
      ]),
    ],
    mirrorId: mirror.id,
    ecosystemIds: supportedEcosystems.map((ecosystem) => ecosystem.id),
  };
}

function tokenize(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function toHit(document: IndexedDocument, matchedTerms: string[]): SearchHit {
  if (document.kind === 'ecosystem') {
    return {
      kind: 'ecosystem',
      id: document.id,
      ecosystemId: document.ecosystemId as string,
      title: document.title,
      subtitle: document.subtitle,
      matchedTerms,
    };
  }

  return {
    kind: 'mirror',
    id: document.id,
    mirrorId: document.mirrorId as string,
    title: document.title,
    subtitle: document.subtitle,
    matchedTerms,
    ecosystemIds: document.ecosystemIds ?? [],
  };
}

/** 命中关键词用于在结果行里显示"为什么它被搜到"，只取真实的别名。 */
function matchedAliases(document: IndexedDocument, tokens: string[]): string[] {
  const aliases = document.kind === 'ecosystem' ? document.terms.slice(3) : document.terms.slice(2);
  const matched = aliases.filter((alias) => {
    const lower = alias.toLowerCase();
    return tokens.some((token) => lower.includes(token) || token.includes(lower));
  });

  return matched.slice(0, 3);
}

/** 生态（0）先于镜像（1）。 */
function kindRank(document: IndexedDocument | undefined): number {
  return document?.kind === 'ecosystem' ? 0 : 1;
}

/**
 * 纯前端检索：索引在内存中构建，不请求后端。
 * 多词查询按“每个词都要命中”合并得分，因此 `清华 pip` 会缩小范围而不是放宽范围；
 * 同一类内按模糊得分排序，生态结果整体排在镜像结果之前。
 */
export function createSearchIndex(catalog: Catalog): SearchIndex {
  const documents: IndexedDocument[] = [];

  for (const ecosystem of catalog.ecosystems) {
    documents.push(toEcosystemDocument(ecosystem));
  }

  for (const mirror of catalog.mirrors) {
    const supported = catalog.ecosystems.filter((ecosystem) =>
      ecosystem.supports.some((support) => support.mirrorId === mirror.id),
    );
    const document = toMirrorDocument(mirror, supported);
    if (document) {
      documents.push(document);
    }
  }

  const fuse = new Fuse(documents, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.34,
    minMatchCharLength: 1,
    keys: [
      { name: 'title', weight: 0.5 },
      { name: 'terms', weight: 0.4 },
      { name: 'subtitle', weight: 0.1 },
    ],
  });

  const byId = new Map(documents.map((document) => [document.id, document]));

  return {
    isEmpty: documents.length === 0,
    search: (query: string): SearchHit[] => {
      const tokens = tokenize(query);
      if (tokens.length === 0) {
        return [];
      }

      const scores = new Map<string, { total: number; hits: number }>();
      for (const token of tokens) {
        for (const result of fuse.search(token, { limit: 24 })) {
          const entry = scores.get(result.item.id) ?? { total: 0, hits: 0 };
          entry.total += result.score ?? 1;
          entry.hits += 1;
          scores.set(result.item.id, entry);
        }
      }

      return [...scores.entries()]
        .filter(([, entry]) => entry.hits === tokens.length)
        .sort((left, right) => {
          const leftDoc = byId.get(left[0]);
          const rightDoc = byId.get(right[0]);
          // 生态结果始终排在镜像结果之前：搜到生态名（pip、npm）时用户最可能想配置该生态，
          // 而镜像品牌名（tuna、腾讯云）不会与生态名竞争，因此这条规则不会遮住镜像结果。
          const byKind = kindRank(leftDoc) - kindRank(rightDoc);
          if (byKind !== 0) {
            return byKind;
          }
          const byScore = left[1].total - right[1].total;
          return byScore !== 0 ? byScore : left[0].localeCompare(right[0]);
        })
        .slice(0, MAX_RESULTS)
        .map(([id]) => byId.get(id))
        .filter((document): document is IndexedDocument => document !== undefined)
        .map((document) => toHit(document, matchedAliases(document, tokens)));
    },
  };
}
