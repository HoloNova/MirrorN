import { z } from 'zod';
import { contentCategoryIds } from '../categories.ts';
import { idSchema, labelSchema, textSchema } from '../schema/primitives.ts';

/** 网络边界与构建投影共用；URL 由合法 ID 生成，不从 JSON 接受跳转地址。 */
export const searchRecordSchema = z.strictObject({
  id: idSchema,
  name: labelSchema,
  summary: textSchema(240),
  category: z.enum(contentCategoryIds),
  aliases: z.array(labelSchema).readonly(),
  tags: z.array(textSchema(128)).readonly(),
  sortKey: textSchema(240).regex(/^[\x20-\x7e]+$/).optional(),
}).readonly();

export const searchIndexSchema = z.strictObject({
  schemaVersion: z.literal(1),
  resources: z.array(searchRecordSchema).refine(
    (records) => new Set(records.map((record) => record.id)).size === records.length,
    '搜索索引不得包含重复 ID',
  ).readonly(),
}).readonly();

export type SearchRecord = z.infer<typeof searchRecordSchema>;
export type SearchIndex = z.infer<typeof searchIndexSchema>;
