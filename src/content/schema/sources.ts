import { z } from 'zod';
import {
  activeMediaTypes, architectureIds, assetPathSchema, dateSchema, fileNameSchema, httpUrlSchema,
  idSchema, labelSchema, multilineTextSchema, platformIds, textSchema, uniqueStrings,
} from './primitives.ts';

export const checksumSchema = z.discriminatedUnion('algorithm', [
  z.strictObject({ algorithm: z.literal('sha256'), value: z.string().regex(/^[a-fA-F0-9]{64}$/, 'SHA256 必须为 64 位十六进制') }),
  z.strictObject({ algorithm: z.literal('sha512'), value: z.string().regex(/^[a-fA-F0-9]{128}$/, 'SHA512 必须为 128 位十六进制') }),
]);

export const artifactSchema = z.strictObject({
  id: idSchema,
  label: labelSchema,
  version: textSchema(120).optional(),
  platform: z.enum(platformIds).optional(),
  arch: z.enum(architectureIds).optional(),
  fileName: fileNameSchema.optional(),
  fileType: textSchema(40).regex(/^[a-zA-Z0-9][a-zA-Z0-9.+-]*$/, 'fileType 使用扩展格式，不含路径').optional(),
  fileSize: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  checksum: checksumSchema.optional(),
});

const commonSourceFields = {
  id: idSchema,
  label: labelSchema,
  note: multilineTextSchema.max(1000).optional(),
  // 不写 health 表示“还没记录状态”，与显式 unknown（已看过但无法判定）不同；缺省不再当成 unknown。
  health: z.enum(['unknown', 'available', 'broken']).optional(),
  checkedAt: dateSchema.optional(),
};

/** 草稿只放宽类型专用字段，已声明的身份、字段类型与引用不放宽。 */
function sourceVariant<const T extends string, S extends z.ZodRawShape>(type: T, fields: S) {
  const dedicated = z.strictObject(fields);
  return {
    published: z.strictObject({ ...commonSourceFields, type: z.literal(type), ...dedicated.shape }),
    draft: z.strictObject({ ...commonSourceFields, type: z.literal(type), ...dedicated.partial().shape }),
  };
}

const direct = sourceVariant('direct', { url: httpUrlSchema, artifactId: idSchema });
const release = sourceVariant('release', {
  url: httpUrlSchema, target: z.enum(['file', 'page']), artifactId: idSchema.optional(),
});
const repository = sourceVariant('repository', {
  url: httpUrlSchema, target: z.enum(['archive', 'page']), artifactId: idSchema.optional(),
});
const packageManager = sourceVariant('package-manager', {
  packageManager: textSchema(80), installCommand: multilineTextSchema,
  shell: z.enum(['bash', 'powershell', 'cmd', 'sh']), url: httpUrlSchema.optional(),
});
const webpage = sourceVariant('webpage', { url: httpUrlSchema });
const mirror = sourceVariant('mirror', {
  url: httpUrlSchema, target: z.enum(['file', 'page']), artifactId: idSchema.optional(),
});
const local = sourceVariant('local', { assetId: idSchema, artifactId: idSchema });
const externalStorage = sourceVariant('external-storage', {
  url: httpUrlSchema, target: z.enum(['file', 'page']), artifactId: idSchema.optional(),
});

export const sourceSchema = z.discriminatedUnion('type', [
  direct.published, release.published, repository.published, packageManager.published,
  webpage.published, mirror.published, local.published, externalStorage.published,
]);
export const draftSourceSchema = z.discriminatedUnion('type', [
  direct.draft, release.draft, repository.draft, packageManager.draft,
  webpage.draft, mirror.draft, local.draft, externalStorage.draft,
]);

export const groupSchema = z.strictObject({
  id: idSchema,
  label: labelSchema,
  sourceIds: uniqueStrings(idSchema).min(1),
  defaultSourceId: idSchema.optional(),
});

const mediaTypeSchema = textSchema(120).regex(
  /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/, 'mediaType 必须是无参数 MIME 类型',
).refine((value) => !activeMediaTypes.includes(value.toLowerCase()), '不接收同源主动内容类型');

export const assetSchema = z.strictObject({
  id: idSchema,
  path: assetPathSchema,
  downloadName: fileNameSchema,
  mediaType: mediaTypeSchema.optional(),
});

export const compatibilitySchema = z.strictObject({
  id: idSchema,
  rows: z.array(z.strictObject({
    platform: z.enum(platformIds), arch: z.enum(architectureIds).optional(),
    support: z.enum(['supported', 'unsupported', 'unknown']),
    version: textSchema(120).optional(), note: multilineTextSchema.max(1000).optional(),
  })).min(1),
});

const bundleFields = {
  schemaVersion: z.literal(1),
  artifacts: z.array(artifactSchema).default([]),
  groups: z.array(groupSchema).default([]),
  assets: z.array(assetSchema).default([]),
  compatibility: z.array(compatibilitySchema).default([]),
};

export const sourcesSchema = z.strictObject({ ...bundleFields, sources: z.array(sourceSchema).default([]) });
export const draftSourcesSchema = z.strictObject({ ...bundleFields, sources: z.array(draftSourceSchema).default([]) });

export type Artifact = z.infer<typeof artifactSchema>;
export type ResourceSource = z.infer<typeof sourceSchema>;
export type DraftResourceSource = z.infer<typeof draftSourceSchema>;
export type ResourceGroup = z.infer<typeof groupSchema>;
export type ResourceAsset = z.infer<typeof assetSchema>;
export type SourcesData = z.infer<typeof sourcesSchema>;
export type DraftSourcesData = z.infer<typeof draftSourcesSchema>;

export function isFileSource(source: DraftResourceSource): boolean {
  if (source.type === 'direct' || source.type === 'local') return true;
  return 'target' in source && (source.target === 'file' || source.target === 'archive');
}
