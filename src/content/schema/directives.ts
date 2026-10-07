import { z } from 'zod';
import { idSchema, labelSchema } from './primitives.ts';

/** 唯一作者接口注册表。component 是内部映射名，不是文档可执行的导入路径。 */
export const directiveRegistry = {
  download: {
    component: 'Download', kind: 'leaf',
    schema: z.strictObject({ source: idSchema, label: labelSchema.optional() }),
  },
  'download-select': {
    component: 'DownloadSelect', kind: 'leaf', schema: z.strictObject({ group: idSchema }),
  },
  'source-list': {
    component: 'SourceList', kind: 'leaf', schema: z.strictObject({ group: idSchema }),
  },
  'install-command': {
    component: 'InstallCommand', kind: 'leaf', schema: z.strictObject({ source: idSchema }),
  },
  notice: {
    component: 'Notice', kind: 'container',
    schema: z.strictObject({ type: z.enum(['info', 'warning', 'danger', 'success']), title: labelSchema.optional() }),
  },
  checksum: {
    component: 'Checksum', kind: 'leaf', schema: z.strictObject({ artifact: idSchema }),
  },
  'compatibility-table': {
    component: 'CompatibilityTable', kind: 'leaf', schema: z.strictObject({ table: idSchema }),
  },
  'resource-card': {
    component: 'ResourceCard', kind: 'leaf', schema: z.strictObject({ resource: idSchema }),
  },
} as const;

export type DirectiveName = keyof typeof directiveRegistry;
export type DirectiveProps<N extends DirectiveName> = z.infer<(typeof directiveRegistry)[N]['schema']>;

export function isDirectiveName(name: string): name is DirectiveName {
  return Object.hasOwn(directiveRegistry, name);
}
