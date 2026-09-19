import { z } from 'zod';

import { PROBE_METHODS, PROBE_MODES } from './probe/index.js';
import { SYNC_SOURCE_KINDS, SYNC_STATUSES } from './sync/index.js';

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
    /** 探针标识。ProbeResult 通过它引用探针；探针地址变更时缓存据此失效。全库唯一。 */
    id: IdSchema,
    /** 必须是数据中审核过的小资源，不能指向正文很大的页面。 */
    url: HttpsUrlSchema,
    /** 实测的审核结论：目标是否返回浏览器可读取的 CORS 头。必须显式声明，不给默认值。 */
    mode: z.enum(PROBE_MODES),
    method: z.enum(PROBE_METHODS).default('head'),
    /** 只有实测确认加查询参数不会被拒绝时才可开启；清华的 robots.txt 加查询参数会返回 403。 */
    cacheBust: z.boolean().default(false),
  })
  .strict();

export const StatusSourceSchema = z
  .object({
    /** 目前只有 tunasync；新增格式必须先核实端点、字段与状态枚举，并记入 docs/upstream.md。 */
    kind: z.enum(SYNC_SOURCE_KINDS),
    url: HttpsUrlSchema,
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
    /** 该站点发布的同步状态文件。只有逐条核实过端点格式的站点才可声明（见 docs/upstream.md）。 */
    statusSource: StatusSourceSchema.optional(),
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
    /** 该镜像的 statusSource 文件里，与本仓库对应的上游作业名（例如 tunasync 的 `pypi`）。 */
    statusJob: z.string().min(1).optional(),
    sources: z.array(SourceInfoSchema).min(1),
  })
  .strict();

/** 上游同步状态接口的响应契约：服务端产出、前端消费，读取快照时也用它校验。 */
export const SyncStatusRecordSchema = z
  .object({
    mirrorId: IdSchema,
    ecosystemId: IdSchema,
    status: z.enum(SYNC_STATUSES),
    lastSuccessAt: z.number().int().nonnegative().optional(),
    lastAttemptAt: z.number().int().nonnegative().optional(),
    nextScheduleAt: z.number().int().nonnegative().optional(),
    upstream: z.string().min(1).optional(),
    job: z.string().min(1).optional(),
    sourceUrl: HttpsUrlSchema,
  })
  .strict();

export const SyncSourceReportSchema = z
  .object({
    url: HttpsUrlSchema,
    ok: z.boolean(),
    fetchedAt: z.number().int().nonnegative().optional(),
    recordCount: z.number().int().nonnegative().optional(),
    skipped: z.number().int().nonnegative().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    error: z.string().min(1).optional(),
  })
  .strict();

export const MirrorsStatusResponseSchema = z
  .object({
    generatedAt: z.number().int().nonnegative(),
    fetchedAt: z.number().int().nonnegative().optional(),
    stale: z.boolean(),
    items: z.array(SyncStatusRecordSchema),
    sources: z.array(SyncSourceReportSchema),
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
export type StatusSource = z.infer<typeof StatusSourceSchema>;
export type SyncStatusRecord = z.infer<typeof SyncStatusRecordSchema>;
export type SyncSourceReport = z.infer<typeof SyncSourceReportSchema>;
export type MirrorsStatusResponse = z.infer<typeof MirrorsStatusResponseSchema>;
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
