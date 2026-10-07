import { z } from 'zod';
import { contentCategoryIds } from '../categories.ts';
import {
  architectureIds, assetPathSchema, dateSchema, formatIds, httpUrlSchema,
  idSchema, labelSchema, originIds, platformIds, textSchema, uniqueStrings,
} from './primitives.ts';

export const tagsSchema = z.strictObject({
  domain: uniqueStrings(idSchema).optional(),
  platform: uniqueStrings(z.enum(platformIds)).optional(),
  arch: uniqueStrings(z.enum(architectureIds)).optional(),
  origin: uniqueStrings(z.enum(originIds)).optional(),
  format: uniqueStrings(z.enum(formatIds)).optional(),
  license: uniqueStrings(textSchema(128)).optional(),
});

const authorsSchema = uniqueStrings(labelSchema.refine(
  (value) => !/[^\s@]+@[^\s@]+\.[^\s@]+/u.test(value), '作者使用显示名或 handle，不填写私人邮箱',
)).min(1);
const summarySchema = textSchema(240);
const statusSchema = z.enum(['active', 'deprecated', 'archived']);

const commonFields = {
  schemaVersion: z.literal(1),
  id: idSchema,
  name: labelSchema,
  category: z.enum(contentCategoryIds),
  aliases: uniqueStrings(labelSchema).default([]),
  sortKey: textSchema(240).regex(/^[\x20-\x7e]+$/, 'sortKey 必须是 ASCII 排序读法').optional(),
  updatedAt: dateSchema.optional(),
  statusReason: textSchema(1000).optional(),
  official: httpUrlSchema.optional(),
  icon: z.union([idSchema, assetPathSchema]).optional(),
  defaultVersion: textSchema(120).optional(),
  seo: z.strictObject({
    title: textSchema(160).optional(),
    description: textSchema(320).optional(),
    image: z.union([httpUrlSchema, assetPathSchema]).optional(),
  }).optional(),
};

export const draftFrontMatterSchema = z.strictObject({
  ...commonFields,
  draft: z.literal(true).default(true),
  summary: summarySchema.optional(),
  tags: tagsSchema.optional(),
  authors: authorsSchema.optional(),
  publishedAt: dateSchema.optional(),
  status: statusSchema.optional(),
});

export const publishedFrontMatterSchema = z.strictObject({
  ...commonFields,
  draft: z.literal(false),
  summary: summarySchema,
  tags: tagsSchema,
  authors: authorsSchema,
  publishedAt: dateSchema,
  status: statusSchema,
});

const metadataUnion = z.discriminatedUnion('draft', [draftFrontMatterSchema, publishedFrontMatterSchema]);

/** 缺 draft 时只补 true，绝不猜测作者是否打算发布。 */
export const frontMatterSchema = z.preprocess((value) => {
  if (value && typeof value === 'object' && !Array.isArray(value) && !Object.hasOwn(value, 'draft')) {
    return { ...value, draft: true };
  }
  return value;
}, metadataUnion).superRefine((value, context) => {
  if (value.publishedAt && value.updatedAt && value.updatedAt < value.publishedAt) {
    context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt 不能早于 publishedAt' });
  }
  if (!value.draft && /^\p{Script=Han}/u.test(value.name) && !value.sortKey) {
    context.addIssue({ code: 'custom', path: ['sortKey'], message: '汉字开头的名称必须提供明确拼音 sortKey' });
  }
  if (!value.draft && value.status !== 'active' && !value.statusReason) {
    context.addIssue({ code: 'custom', path: ['statusReason'], message: 'deprecated / archived 必须说明原因' });
  }
});

export type FrontMatter = z.infer<typeof frontMatterSchema>;
export type PublishedFrontMatter = z.infer<typeof publishedFrontMatterSchema>;
export type DraftFrontMatter = z.infer<typeof draftFrontMatterSchema>;
