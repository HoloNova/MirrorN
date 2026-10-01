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

/** 生态分类：站点资源与教程都挂在它下面，供筛选与搜索使用。 */
export const ECOSYSTEM_CATEGORIES = [
  'language',
  'distro',
  'package-index',
  'toolchain',
  'dataset',
  'other',
] as const;

export const EcosystemTaxonomyEntrySchema = z
  .object({
    id: IdSchema,
    /** 界面上给人看的名字，例如 “Node.js”“Rocky Linux”。 */
    label: z.string().min(1),
    category: z.enum(ECOSYSTEM_CATEGORIES),
    aliases: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const EcosystemTaxonomySchema = z
  .array(EcosystemTaxonomyEntrySchema)
  .min(1)
  .superRefine((entries, context) => {
    const ids = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      if (ids.has(entry.id)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: `生态 ID 重复：${entry.id}`,
        });
      }
      ids.add(entry.id);
    }
  });

/** 站点资源的类型；决定页面怎么呈现、抓取器要不要下钻到文件。 */
/** 站点资源的 id 沿用镜像站自己公布的仓库键（出现过 CRAN 这样的大写），因此大小写均允许。 */
const ResourceIdSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/, '只能使用字母、数字、连字符和下划线');

export const RESOURCE_KINDS = [
  'installer',
  'iso',
  'files',
  'dataset',
  'distro-repo',
  'language-repo',
] as const;

export const RESOURCE_PLATFORMS = ['windows', 'macos', 'linux', 'android', 'freebsd'] as const;

/** 一个站点上的一条资源（= 官方目录里的一条仓库）。 */
export const SiteResourceSchema = z
  .object({
    id: ResourceIdSchema,
    name: z.string().min(1),
    ecosystemId: IdSchema,
    kind: z.enum(RESOURCE_KINDS),
    /** 站内可给用户下载/浏览的入口；必须是该镜像站自己域名下的地址。 */
    downloadEntry: HttpsUrlSchema,
    /** 版本/发行版层级的实际形态，来自实际列目录，不是推测。 */
    versionsHint: z.string().min(1),
    platforms: z.array(z.enum(RESOURCE_PLATFORMS)).min(1),
    /** 镜像站自己提供的帮助文档；没有就 null。 */
    helpDocUrl: HttpsUrlSchema.nullable(),
    /**
     * 从下载入口往下钻几层去找文件；0 表示不抓（目录里成百上千个项目时）。
     * 不写就按类型取默认值：安装器 2、安装镜像 3、数据集/通用文件 2、软件源 0。
     */
    crawlDepth: z.number().int().min(0).max(4).optional(),
    /** 仓库里已有的 Markdown 教程 id（data/tutorials.json）；没有就 null。 */
    tutorialId: IdSchema.nullable(),
    /** 实际请求过的证据 URL + 观察到的事实。 */
    evidence: z.string().min(1),
    uncertain: z.string().min(1).nullable(),
  })
  .strict();

export const SiteResourceListSchema = z
  .object({
    siteId: IdSchema,
    checkedAt: IsoDateSchema,
    resources: z.array(SiteResourceSchema).min(1),
  })
  .strict();

/** 我们自己的 Markdown 教程：搜索、筛选与资源页都引用它。 */
export const TutorialSchema = z
  .object({
    id: IdSchema,
    title: z.string().min(1),
    /** 相对 apps/web/src/tutorials/ 的文件名。 */
    file: z.string().regex(/^[a-z0-9-]+\.md$/, '必须是 tutorials/ 下的 .md 文件名'),
    ecosystemIds: z.array(IdSchema).min(1),
    summary: z.string().min(1),
    aliases: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const TutorialListSchema = z
  .array(TutorialSchema)
  .min(1)
  .superRefine((entries, context) => {
    const ids = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      if (ids.has(entry.id)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: `教程 ID 重复：${entry.id}`,
        });
      }
      ids.add(entry.id);
    }
  });

/** 站点官方公布的仓库目录，不等于包体抽样或可生成命令的来源。 */
export const SiteInventorySchema = z
  .object({
    siteId: IdSchema,
    sourceUrl: HttpsUrlSchema,
    checkedAt: IsoDateSchema,
    repositories: z
      .array(
        z
          .object({
            id: z.string().regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/),
            name: z.string().min(1),
            path: z.string().regex(/^\/[A-Za-z0-9-]+\/$/),
            description: z.string().min(1).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((inventory, context) => {
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const [index, repo] of inventory.repositories.entries()) {
      if (ids.has(repo.id) || paths.has(repo.path)) {
        context.addIssue({
          code: 'custom',
          path: ['repositories', index],
          message: '仓库 ID 和路径在站点内须唯一',
        });
      }
      ids.add(repo.id);
      paths.add(repo.path);
    }
  });

/** 目录层的一次真实包体抽查；不是持续健康度，也不能自动进入推荐。 */
export const SiteRepositorySchema = z
  .object({
    /** 同站点内稳定、唯一的仓库 ID；地址变更时仍保持不变。 */
    id: IdSchema,
    ecosystemId: IdSchema,
    name: z.string().min(1),
    /** 客户端配置的 HTTP 基址；Cargo 的 sparse+ 只在生成配置时添加。 */
    repositoryUrl: HttpsUrlSchema,
    /** 只描述本次验证覆盖的包、版本或架构，不表示整个仓库都已验证。 */
    scope: z.string().min(1),
    sampleUrl: HttpsUrlSchema,
    /** 记录当时的终点；CDN 节点会变化，后续不能以 URL 完全相等为准。 */
    sampleFinalUrl: HttpsUrlSchema,
    sampleBytes: z.number().int().positive(),
    sampleSha256: z.string().regex(/^[0-9a-f]{64}$/, '必须是实际读取包体的 SHA-256'),
    checkedAt: IsoDateSchema,
    sourceUrl: HttpsUrlSchema,
  })
  .strict();

/** 站点是收录主体；可配置向导仍由 ecosystems/*.json 的 supports 唯一管理。 */
export const SiteRepositoryGroupSchema = z
  .object({
    siteId: IdSchema,
    repositories: z.array(SiteRepositorySchema).min(1),
  })
  .strict();
export const SiteRepositoryGroupListSchema = z.array(SiteRepositoryGroupSchema);

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
export type SiteInventory = z.infer<typeof SiteInventorySchema>;
export type EcosystemTaxonomyEntry = z.infer<typeof EcosystemTaxonomyEntrySchema>;
export type SiteResource = z.infer<typeof SiteResourceSchema>;
export type SiteResourceList = z.infer<typeof SiteResourceListSchema>;
export type Tutorial = z.infer<typeof TutorialSchema>;
export type SiteRepository = z.infer<typeof SiteRepositorySchema>;
export type SiteRepositoryGroup = z.infer<typeof SiteRepositoryGroupSchema>;
export type MirrorSupport = z.infer<typeof MirrorSupportSchema>;
export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;
export type GuideCommand = z.infer<typeof GuideCommandSchema>;
export type ConfigFile = z.infer<typeof ConfigFileSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type Restore = z.infer<typeof RestoreSchema>;
export type GuideVariant = z.infer<typeof GuideVariantSchema>;
export type Ecosystem = z.infer<typeof EcosystemSchema>;
export type Troubleshooting = z.infer<typeof TroubleshootingSchema>;
