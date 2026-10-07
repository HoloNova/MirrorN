import type { ResourceDocument } from '../parse/document-types.ts';
import type { FrontMatter, PublishedFrontMatter } from '../schema/front-matter.ts';
import type { DraftSourcesData, SourcesData } from '../schema/sources.ts';
import type { ValidatedAssetFile } from '../validate/file-types.ts';

export type DeepReadonly<T> = T extends readonly (infer Entry)[] ? readonly DeepReadonly<Entry>[]
  : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } : T;

export interface ResourceRecord<Metadata extends FrontMatter = FrontMatter, Data extends DraftSourcesData = DraftSourcesData> {
  readonly metadata: DeepReadonly<Metadata>;
  readonly data: DeepReadonly<Data>;
  readonly document: DeepReadonly<ResourceDocument>;
  readonly files: readonly DeepReadonly<ValidatedAssetFile>[];
  readonly resourceReferences: readonly string[];
}

export type PublishedResource = ResourceRecord<PublishedFrontMatter, SourcesData>;
export type PreviewResource = ResourceRecord;

export interface RegistrySummary {
  readonly totalResources: number;
  readonly publishedResources: number;
  readonly draftResources: number;
  readonly selectedResources: number;
  readonly selectedAssetFiles: number;
}

export interface ResourceRegistry<Resource extends PreviewResource = PublishedResource> {
  readonly mode: 'public' | 'preview';
  readonly resources: readonly Resource[];
  readonly summary: RegistrySummary;
  readonly get: (id: string) => Resource | undefined;
  readonly referencesTo: (id: string) => readonly string[];
}

/** 输出复制后冻结，不把 Zod 对象或解析树的可变引用交给页面。 */
export function freezeData<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => freezeData(entry))) as DeepReadonly<T>;
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freezeData(entry)]))) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}
