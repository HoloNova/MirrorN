import { z } from 'zod';

const id = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  .max(100);
export const DownloadPlatformSchema = z.enum(['windows', 'macos', 'linux']);
export const DownloadPurposeSchema = z.enum([
  'installer',
  'runtime',
  'system_image',
  'network_installer',
]);
export const RulePatternSchema = z
  .string()
  .min(2)
  .max(1000)
  .refine((value) => {
    try {
      return (
        value.startsWith('^') &&
        value.endsWith('$') &&
        !/\\[1-9]|\(\?[=!<][=!]/.test(value) &&
        Boolean(new RegExp(value))
      );
    } catch {
      return false;
    }
  }, '规则必须是可编译的锚定正则，不支持反向引用');
export const SoftwareIdentitySchema = z
  .object({
    slug: id,
    resourceKey: id,
    name: z.string().min(1).max(160),
    aliases: z.array(z.string().max(80)).max(30),
    ecosystemId: id,
    repo: id,
    tutorialId: id.optional(),
  })
  .strict();
export const DownloadMatchSchema = z
  .object({
    id,
    pattern: RulePatternSchema,
    platforms: z.array(DownloadPlatformSchema).max(3),
    platformCapture: z.string().max(60).optional(),
    purpose: DownloadPurposeSchema,
    parser: z
      .enum(['standard', 'conda', 'rtools', 'kafka', 'kubernetes', 'texlive'])
      .default('standard'),
    versionKind: z.enum(['version', 'date', 'alias']).default('version'),
    requirements: z.record(z.union([z.string().max(160), z.boolean()])).default({}),
  })
  .strict();
export const DownloadRuleSchema = z
  .object({
    id,
    status: z.enum(['active', 'draft', 'disabled']),
    templateId: id,
    softwareIds: z.array(id).min(1).max(10),
    matches: z.array(DownloadMatchSchema).min(1).max(20),
    reject: z.array(RulePatternSchema).max(30).default([]),
    evidenceRefs: z.array(z.string().max(250)).min(1).max(20),
  })
  .strict();
export const DownloadTemplateSchema = z
  .object({
    id: z.enum(['flat', 'version-directory', 'system-image', 'scoped-package']),
    maxDepth: z.number().int().min(0).max(12),
  })
  .strict();
export const DownloadBindingSchema = z
  .object({
    id,
    siteId: z.literal('pku'),
    repoId: id,
    ruleId: id,
    rootPath: z.string().min(2).max(400),
    // 按相对深度指定目录布局；未知布局不会自动遍历全站。
    steps: z.array(RulePatternSchema).max(12),
    leaf: RulePatternSchema,
    ignoreDirectories: z.array(RulePatternSchema).max(20).default([]),
  })
  .strict();
export const DownloadManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    templates: z.literal('templates.json'),
    rules: z.literal('software/rules.json'),
    bindings: z.literal('sites/pku.json'),
  })
  .strict();
export type DownloadRule = z.infer<typeof DownloadRuleSchema>;
export type DownloadMatch = z.infer<typeof DownloadMatchSchema>;
export type DownloadBinding = z.infer<typeof DownloadBindingSchema>;
export type SoftwareIdentity = z.infer<typeof SoftwareIdentitySchema>;
