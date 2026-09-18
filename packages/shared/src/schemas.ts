import { z } from 'zod';

const IdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '只能使用小写字母、数字和连字符');

const HttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', '地址必须使用 HTTPS');

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须使用 YYYY-MM-DD 格式')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), '日期无效');

export const SourceInfoSchema = z
  .object({
    url: HttpsUrlSchema,
    checkedAt: IsoDateSchema,
    license: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
  })
  .strict();

export const ProbeConfigSchema = z
  .object({
    url: HttpsUrlSchema,
    method: z.enum(['head', 'get']).default('head'),
    cacheBust: z.boolean().default(false),
  })
  .strict();

export const MirrorSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    kind: z.enum(['official', 'university', 'commercial', 'community']),
    homepageUrl: HttpsUrlSchema,
    /** 搜索用的别名：中英文名称、拼音、常用简称，例如 tuna / 清华源 / 淘宝源。 */
    aliases: z.array(z.string().min(1)).min(1),
    probe: ProbeConfigSchema.optional(),
    sources: z.array(SourceInfoSchema).min(1),
  })
  .strict();

export const MirrorListSchema = z.array(MirrorSchema);

export const MirrorSupportSchema = z
  .object({
    ecosystemId: IdSchema,
    mirrorId: IdSchema,
    repositoryUrl: HttpsUrlSchema,
    supportsPublish: z.boolean().default(false),
    sources: z.array(SourceInfoSchema).min(1),
  })
  .strict();

export const TemplateVariableSchema = z.enum(['mirrorUrl', 'packageName', 'configPath']);

export const GuideCommandSchema = z
  .object({
    label: z.string().min(1),
    command: z.string().min(1),
    note: z.string().min(1).optional(),
  })
  .strict();

export const ConfigFileSchema = z
  .object({
    path: z.string().min(1),
    format: z.enum(['ini', 'json', 'text']),
    content: z.string().min(1),
    instructions: z.string().min(1),
    backup: z.string().min(1).optional(),
  })
  .strict();

export const VerificationSchema = z
  .object({
    command: z.string().min(1),
    expected: z.string().min(1),
    note: z.string().min(1).optional(),
  })
  .strict();

export const RestoreSchema = z
  .object({
    command: z.string().min(1),
    expected: z.string().min(1),
    note: z.string().min(1).optional(),
  })
  .strict();

export const GuideVariantSchema = z
  .object({
    id: IdSchema,
    os: z.enum(['windows', 'macos', 'linux']),
    shell: z.enum(['powershell', 'cmd', 'bash', 'zsh']),
    distribution: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    variables: z.array(TemplateVariableSchema).default([]),
    temporary: GuideCommandSchema.optional(),
    persistent: GuideCommandSchema.optional(),
    configFile: ConfigFileSchema.optional(),
    verification: VerificationSchema,
    restore: RestoreSchema,
    sources: z.array(SourceInfoSchema).min(1),
  })
  .strict()
  .superRefine((guide, context) => {
    if (!guide.temporary && !guide.persistent && !guide.configFile) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '至少提供临时配置、持久配置或配置文件中的一种',
        path: ['temporary'],
      });
    }
  });

export const EcosystemSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    packageManager: z.string().min(1),
    description: z.string().min(1),
    prerequisites: z.array(z.string().min(1)).min(1),
    aliases: z.array(z.string().min(1)).min(1),
    supports: z.array(MirrorSupportSchema).min(1),
    guides: z.array(GuideVariantSchema).min(1),
    sources: z.array(SourceInfoSchema).min(1),
  })
  .strict();

export const EcosystemListSchema = z.array(EcosystemSchema);

export const TroubleshootingStepSchema = z
  .object({
    title: z.string().min(1),
    content: z.string().min(1),
  })
  .strict();

export const TroubleshootingSchema = z
  .object({
    id: IdSchema,
    ecosystemId: IdSchema,
    title: z.string().min(1),
    problem: z.string().min(1),
    steps: z.array(TroubleshootingStepSchema).min(1),
    sources: z.array(SourceInfoSchema).min(1),
  })
  .strict();

export const TroubleshootingListSchema = z.array(TroubleshootingSchema);

export type SourceInfo = z.infer<typeof SourceInfoSchema>;
export type ProbeConfig = z.infer<typeof ProbeConfigSchema>;
export type Mirror = z.infer<typeof MirrorSchema>;
export type MirrorSupport = z.infer<typeof MirrorSupportSchema>;
export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;
export type GuideCommand = z.infer<typeof GuideCommandSchema>;
export type ConfigFile = z.infer<typeof ConfigFileSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type Restore = z.infer<typeof RestoreSchema>;
export type GuideVariant = z.infer<typeof GuideVariantSchema>;
export type Ecosystem = z.infer<typeof EcosystemSchema>;
export type Troubleshooting = z.infer<typeof TroubleshootingSchema>;
