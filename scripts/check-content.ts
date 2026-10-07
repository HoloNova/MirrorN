import { fileURLToPath } from 'node:url';
import { siteConfig } from '../config/site.ts';
import { ContentError, formatIssue } from '../src/content/diagnostics.ts';
import { loadResourceRegistry } from '../src/content/registry/load.ts';

const allowedArguments = ['--json', '--include-drafts', '--help', '-h'] as const;
const help = `Usage: pnpm content:check [--json] [--include-drafts]\n\n校验 content/resources 内的全部资源。默认注册表只含公开资源。\n--json            输出结构化摘要或错误（不导出正文）\n--include-drafts  显式查看本地草稿注册表；production 禁用\n--help, -h        显示帮助\n`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  try {
    const invalid = args.find((argument) => !allowedArguments.includes(argument as (typeof allowedArguments)[number]));
    if (invalid) {
      throw new ContentError([{
        resourceId: 'site', file: 'scripts/check-content.ts', line: 1, column: 1,
        field: 'argv', code: 'E_ARGUMENT', message: `不支持参数 ${invalid}`,
      }]);
    }
    if (args.includes('--help') || args.includes('-h')) { process.stdout.write(help); return; }
    const root = fileURLToPath(new URL('../', import.meta.url));
    const options = { siteUrl: siteConfig.siteUrl };
    const registry = args.includes('--include-drafts')
      ? await loadResourceRegistry(root, { ...options, mode: 'preview' })
      : await loadResourceRegistry(root, options);
    if (json) {
      process.stdout.write(`${JSON.stringify({ ok: true, mode: registry.mode, ...registry.summary, resourceIds: registry.resources.map((resource) => resource.metadata.id) }, null, 2)}\n`);
    } else {
      const counts = registry.summary;
      process.stdout.write(`内容校验通过：${counts.totalResources} 个资源（${counts.publishedResources} 个公开、${counts.draftResources} 个草稿）。\n`);
      process.stdout.write(`当前 ${registry.mode} 注册表：${counts.selectedResources} 个资源，${counts.selectedAssetFiles} 个实际引用的本地文件。\n`);
    }
  } catch (error) {
    const issues = error instanceof ContentError ? error.issues : undefined;
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(json ? `${JSON.stringify({ ok: false, issues: issues ?? [], message }, null, 2)}\n`
      : `${issues ? issues.map(formatIssue).join('\n') : message}\n`);
    process.exitCode = 1;
  }
}

await main();
