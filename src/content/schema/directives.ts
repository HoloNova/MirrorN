import { z } from 'zod';
import { dateSchema, httpUrlSchema, idSchema, labelSchema, textSchema } from './primitives.ts';

/** 唯一作者接口注册表。component 是内部映射名，不是文档可执行的导入路径。 */
export const directiveRegistry = {
  /**
   * 两种写法二选一：`source` 引用 sources.json（有版本／校验／多来源时用）；
   * `url` 直接在正文里写一个链接（只想放一个下载入口时用）。行内写法的状态字段与
   * sources.json 的 health／checkedAt／note 同义，规则也一致，避免两种写法产生两套语义。
   */
  download: {
    component: 'Download', kind: 'leaf',
    schema: z.strictObject({
      source: idSchema.optional(), label: labelSchema.optional(),
      url: httpUrlSchema.optional(), target: z.enum(['file', 'page']).optional(),
      status: z.enum(['unknown', 'available', 'broken']).optional(), checked: dateSchema.optional(), note: textSchema(1000).optional(),
    }).superRefine((value, context) => {
      const add = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
      if (value.source !== undefined === (value.url !== undefined)) {
        add(value.source !== undefined ? 'url' : 'source', '必须且只能写 source（引用 sources.json）或 url（行内链接）之一');
        return;
      }
      if (value.source !== undefined) {
        for (const key of ['target', 'status', 'checked', 'note'] as const) if (value[key] !== undefined) add(key, `${key} 只用于 url 写法；使用 source 时在 sources.json 维护`);
        return;
      }
      if (!value.label) add('label', 'url 写法必须提供 label，按钮文字要说明真实行为');
      if (value.status === 'available' && !value.checked) add('checked', 'status="available" 必须提供核查日期 checked');
      if (value.status !== 'available' && value.checked) add('checked', 'checked 只与 status="available" 一起使用');
      if (value.status === 'broken' && !value.note) add('note', 'status="broken" 必须在 note 说明原因');
    }),
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
    schema: z.strictObject({ type: z.enum(['info', 'warning', 'danger', 'success', 'note']), title: labelSchema.optional() }),
  },
  /** 作者手写的选项切换：只显示所选选项的内容，选项里可放 Markdown、下载、命令等。与数据驱动的 download-select 并存。 */
  choice: {
    component: 'Choice', kind: 'container', schema: z.strictObject({ label: labelSchema }),
  },
  option: {
    component: 'ChoiceOption', kind: 'container', schema: z.strictObject({ label: labelSchema }),
  },
  details: {
    component: 'Details', kind: 'container', schema: z.strictObject({ title: labelSchema }),
  },
  steps: {
    component: 'Steps', kind: 'container', schema: z.strictObject({}),
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
