import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { idSchema } from '../src/content/schema/primitives.ts';
import { projectRoot, reportFailure } from './run.ts';

/** 只创建草稿文件，不改发布状态，不覆盖已有资源，也不添加伪造来源。 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error('Usage: pnpm resource:new <resource-id>');
  const id = idSchema.parse(args[0]);
  const template = join(projectRoot, 'templates/resource');
  const [markdown, sources] = await Promise.all([
    readFile(join(template, 'index.md'), 'utf8'), readFile(join(template, 'sources.json'), 'utf8'),
  ]);
  const normalized = markdown.replace(/\r\n/gu, '\n');
  if (!normalized.includes('\nid: resource-id\n')) throw new Error('模板必须包含稳定 id: resource-id 标记');
  const target = join(projectRoot, 'content/resources', id);
  await mkdir(target); // EEXIST 即失败，不允许覆盖或自动合并。
  try {
    await writeFile(join(target, 'index.md'), normalized.replace('\nid: resource-id\n', `\nid: ${id}\n`), { encoding: 'utf8', flag: 'wx' });
    await writeFile(join(target, 'sources.json'), sources, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    throw new Error(`资源目录已创建，但初始化未完成：content/resources/${id}。请修正文件后再校验。${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  process.stdout.write(`已创建草稿 content/resources/${id}/。编写后运行 pnpm content:check --include-drafts；草稿不生成公开页面。\n`);
}
await main().catch(reportFailure);
