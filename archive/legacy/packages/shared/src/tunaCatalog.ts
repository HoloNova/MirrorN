import { z } from 'zod';
import {
  DownloadPlatformSchema,
  DownloadPurposeSchema,
  RulePatternSchema,
} from './downloadRules.js';

/** 审阅的软件身份映射；版本和文件URL只能来自在线官方清单。 */
export const TunaCatalogBindingSchema = z
  .object({
    group: z.string().min(1).max(160),
    softwareId: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
      .max(100),
    roots: z
      .array(
        z
          .string()
          .min(2)
          .max(300)
          .regex(/^[A-Za-z0-9][A-Za-z0-9_./-]*\/$/),
      )
      .min(1)
      .max(5),
    filename: RulePatternSchema.optional(),
    reject: z.array(RulePatternSchema).max(20).default([]),
    formats: z
      .array(
        z.enum([
          'binary',
          'gz',
          'exe',
          'msi',
          'pkg',
          'dmg',
          'sh',
          'zip',
          '7z',
          '7z.exe',
          'tar.gz',
          'tar.xz',
          'tar.bz2',
          'pkg.tar.zst',
          'flatpak',
          'tgz',
          'AppImage',
          'deb',
          'rpm',
          'run',
          'iso',
          'msixbundle',
          'appxbundle',
        ]),
      )
      .min(1)
      .max(20),
    purpose: DownloadPurposeSchema,
    platforms: z.array(DownloadPlatformSchema).min(1).max(3).optional(),
  })
  .strict();
export const TunaCatalogConfigSchema = z
  .object({
    bindings: z.array(TunaCatalogBindingSchema).min(1).max(200),
    excludedGroups: z
      .array(
        z
          .object({ group: z.string().min(1).max(160), reason: z.string().min(1).max(200) })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type TunaCatalogBinding = z.infer<typeof TunaCatalogBindingSchema>;
export type TunaCatalogConfig = z.infer<typeof TunaCatalogConfigSchema>;

/** 清华官方下载弹窗的机器可读响应；允许上游增加字段，但已知字段必须完整。 */
export const TunaCatalogPayloadSchema = z
  .array(
    z.object({
      distro: z.string().min(1).max(160),
      category: z.enum(['os', 'app', 'font']),
      urls: z
        .array(z.object({ name: z.string().min(1).max(300), url: z.string().min(2).max(2000) }))
        .max(10000),
    }),
  )
  .min(1)
  .max(200)
  .refine((rows) => {
    const count = rows.reduce((n, row) => n + row.urls.length, 0);
    return count > 0 && count <= 20000;
  }, '官方下载清单为空或超限');
