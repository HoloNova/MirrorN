import { z } from 'zod';
import { RulePatternSchema } from './downloadRules.js';

/**
 * 版本规则：同一生态跨源站共用，软件级可覆盖。规则只描述“保留哪些支线”，不逐个钉版本。
 * - lineParts：几点几级算一条支线（Node.js 用主版本，Ubuntu 用年月）；
 * - linePattern：认可的支线形态（如偶数主版本、偶数年.04 的 LTS）；
 * - latestLines：自动保留最新的几条支线；
 * - keepLines：额外固定保留的支线，用于学校/教学仍在推荐的旧版本；
 * - prerelease：是否保留预览版；eol：支线到期日，过期支线不再采集。
 */
export const VersionRuleSchema = z
  .object({
    lineParts: z.number().int().min(1).max(3).default(2),
    linePattern: RulePatternSchema.optional(),
    latestLines: z.number().int().min(1).max(6).default(2),
    keepLines: z.array(z.string().min(1).max(24)).max(20).default([]),
    prerelease: z.enum(['exclude', 'include']).default('exclude'),
    eol: z
      .record(
        z
          .string()
          .regex(/^\d+(?:\.\d+)*$/)
          .max(20),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      )
      .default({}),
  })
  .strict();
export const VersionPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    default: VersionRuleSchema,
    ecosystems: z.record(VersionRuleSchema).default({}),
    software: z.record(VersionRuleSchema).default({}),
  })
  .strict();
export type VersionRule = z.infer<typeof VersionRuleSchema>;
export type VersionPolicy = z.infer<typeof VersionPolicySchema>;
