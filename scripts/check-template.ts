import { join } from 'node:path';
import { readResource } from '../src/content/registry/input.ts';
import { validateSourceData } from '../src/content/validate/source-data.ts';
import { validateDirectives } from '../src/content/validate/directive-references.ts';
import { ContentError } from '../src/content/diagnostics.ts';
import { projectRoot, reportFailure } from './run.ts';

/** 检查长期贡献模板本身，不创建临时资源，也不把模板注册为公开内容。 */
async function main(): Promise<void> {
  const input = await readResource({ id: 'resource-id', absolutePath: join(projectRoot, 'templates/resource') });
  if (!input.metadata.draft) throw new Error('新资源模板必须保持 draft=true');
  const issues = [...validateSourceData(input), ...validateDirectives(input, new Map([[input.metadata.id, input]]))];
  if (issues.length) throw new ContentError(issues);
  process.stdout.write('贡献模板校验通过：受限语法与字段契约有效，未生成资源页面。\n');
}
await main().catch(reportFailure);
