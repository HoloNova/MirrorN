import { z } from 'zod';

export const ContentStateSchema = z.enum(['draft', 'published', 'disabled']);
const id = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
const text = z.string().trim().max(200);
const note = z.string().trim().max(4000).default('');
const ref = id.or(z.literal('')).default('');
const order = z.number().int().min(0).max(9999).default(0);
const date = z
  .string()
  .refine((value) => {
    if (value === '') return true;
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, '日期必须有效，格式为 YYYY-MM-DD')
  .default('');
const state = ContentStateSchema.default('draft');
const platform = z.enum(['', 'any', 'windows', 'macos', 'linux', 'android', 'freebsd']);
const platforms = z
  .array(platform.exclude(['']))
  .max(6)
  .default([]);
export const ContentUrlSchema = z
  .string()
  .max(4096)
  .refine((value) => {
    if (value === '') return true;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, '仅支持不含用户名和密码的 HTTP/HTTPS 链接');

export const CuratedComponentSchema = z
  .object({
    id,
    name: text.default(''),
    description: note,
    kind: z.enum(['software', 'tool', 'module']).default('software'),
    status: state,
  })
  .strict();
export const CuratedVersionSchema = z
  .object({
    id,
    componentId: ref,
    version: text.default(''),
    branch: text.default(''),
    channel: text.default(''),
    recommendation: z.enum(['none', 'default', 'compatible']).default('none'),
    reason: note,
    releasedAt: date,
    eolAt: date,
    order,
    status: state,
  })
  .strict();
export const CuratedLinkSchema = z
  .object({
    id,
    label: text.default(''),
    siteId: ref,
    url: ContentUrlSchema.default(''),
    enabled: z.boolean().default(true),
    checkedAt: date,
    note,
  })
  .strict();
export const CuratedResourceSchema = z
  .object({
    id,
    componentId: ref,
    versionId: ref,
    title: text.default(''),
    kind: z.enum(['file', 'directory', 'repository']).default('file'),
    platform: platform.default(''),
    arch: text.default(''),
    format: text.default(''),
    filename: text.default(''),
    sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null),
    sha256: z
      .string()
      .regex(/^(?:[a-fA-F0-9]{64})?$/)
      .default(''),
    links: z.array(CuratedLinkSchema).max(30).default([]),
    order,
    status: state,
  })
  .strict();
export const CuratedDependencySchema = z
  .object({
    id,
    name: text.default(''),
    targetEcosystemId: ref,
    componentId: ref,
    versionIds: z.array(id).max(100).default([]),
    platforms,
    requirement: text.default(''),
    optional: z.boolean().default(false),
    note,
    status: state,
  })
  .strict();
export const CuratedTutorialSchema = z
  .object({
    id,
    title: text.default(''),
    summary: note,
    componentId: ref,
    versionIds: z.array(id).max(100).default([]),
    platforms,
    resourceIds: z.array(id).max(100).default([]),
    markdown: z.string().max(100000).default(''),
    order,
    status: state,
  })
  .strict();

/** 编辑稿与发布稿共用契约；草稿允许未填完，发布额外检查可用性。 */
export const CuratedDocumentSchema = z
  .object({
    id,
    name: text.min(1),
    summary: note,
    category: z
      .enum(['language', 'distro', 'package-index', 'toolchain', 'dataset', 'other'])
      .default('other'),
    aliases: z.array(text.min(1)).max(40).default([]),
    components: z.array(CuratedComponentSchema).max(100).default([]),
    versions: z.array(CuratedVersionSchema).max(200).default([]),
    dependencies: z.array(CuratedDependencySchema).max(200).default([]),
    resources: z.array(CuratedResourceSchema).max(500).default([]),
    tutorials: z.array(CuratedTutorialSchema).max(100).default([]),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    for (const key of [
      'components',
      'versions',
      'dependencies',
      'resources',
      'tutorials',
    ] as const) {
      const names = doc[key].map((entry) => entry.id);
      if (new Set(names).size !== names.length) issue([key], '同一分区的标识不能重复');
    }
    const exists = (key: 'components' | 'versions' | 'resources', value: string) =>
      !value || doc[key].some((entry) => entry.id === value);
    for (const key of ['versions', 'dependencies', 'resources', 'tutorials'] as const) {
      doc[key].forEach((entry, index) => {
        if (!exists('components', entry.componentId))
          issue([key, index, 'componentId'], '引用的组成项不存在');
      });
    }
    doc.resources.forEach((entry, index) => {
      if (!exists('versions', entry.versionId))
        issue(['resources', index, 'versionId'], '引用的版本不存在');
      const version = doc.versions.find((v) => v.id === entry.versionId);
      if (version && version.componentId !== entry.componentId)
        issue(['resources', index, 'versionId'], '资源和版本必须属于同一组成项');
      if (new Set(entry.links.map((link) => link.id)).size !== entry.links.length)
        issue(['resources', index, 'links'], '来源标识不能重复');
      const urls = entry.links.map((link) => link.url).filter(Boolean);
      if (new Set(urls).size !== urls.length)
        issue(['resources', index, 'links'], '同一资源不能重复填写相同链接');
    });
    for (const key of ['dependencies', 'tutorials'] as const) {
      doc[key].forEach((entry, index) => {
        for (const version of entry.versionIds) {
          if (!exists('versions', version)) issue([key, index, 'versionIds'], '引用的版本不存在');
          else if (doc.versions.find((v) => v.id === version)?.componentId !== entry.componentId)
            issue([key, index, 'versionIds'], '版本和条目必须属于同一组成项');
        }
      });
    }
    doc.tutorials.forEach((entry, index) => {
      if (entry.resourceIds.some((resource) => !exists('resources', resource)))
        issue(['tutorials', index, 'resourceIds'], '引用的资源不存在');
    });
    const versions = doc.versions
      .filter((v) => v.version)
      .map((v) => `${v.componentId}:${v.version}`);
    if (new Set(versions).size !== versions.length)
      issue(['versions'], '同一组成项的版本号不能重复');
  });

export const CreateCuratedSchema = z.object({ id, name: text.min(1) }).strict();
export const SaveCuratedSchema = z
  .object({ revision: z.number().int().positive(), document: CuratedDocumentSchema })
  .strict();
export const PublicationSchema = z
  .object({ revision: z.number().int().positive(), state: z.enum(['published', 'disabled']) })
  .strict();
export const AdminLoginSchema = z
  .object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(256) })
  .strict();

export type ContentState = z.infer<typeof ContentStateSchema>;
export type CuratedDocument = z.infer<typeof CuratedDocumentSchema>;
export type CuratedVersion = z.infer<typeof CuratedVersionSchema>;
export type CuratedResource = z.infer<typeof CuratedResourceSchema>;
export type CuratedTutorial = z.infer<typeof CuratedTutorialSchema>;
export type CuratedLink = z.infer<typeof CuratedLinkSchema>;
export interface CuratedRecord {
  document: CuratedDocument;
  revision: number;
  publishedRevision: number | null;
  state: ContentState;
  updatedAt: number;
  publishedAt: number | null;
}
export interface CuratedSummary {
  id: string;
  name: string;
  summary: string;
  category: string;
  aliases: string[];
  componentCount: number;
  versionCount: number;
  publishedAt: number;
}
export interface AdminSession {
  username: string;
  csrf: string;
  expiresAt: number;
}
