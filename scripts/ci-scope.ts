import { execFile } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

interface Event { before?: string; pull_request?: { base?: { sha?: string } } }
const shaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

/** 使用 SHA 与 NUL 分隔文件名，不把 PR 标题／分支／路径插进 shell。未知范围保守全检查。 */
async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const event = eventPath ? JSON.parse(await readFile(eventPath, 'utf8')) as Event : {};
  const base = event.pull_request?.base?.sha ?? event.before;
  const head = process.env.GITHUB_SHA;
  let full = true;
  if (base && head && shaPattern.test(base) && shaPattern.test(head) && !/^0+$/u.test(base)) {
    const { stdout } = await promisify(execFile)('git', ['diff', '--name-only', '-z', base, head], { maxBuffer: 4 * 1024 * 1024 });
    const paths = stdout.split('\u0000').filter(Boolean);
    const docsOnly = (path: string) => path.startsWith('archive/') || path.startsWith('docs/')
      || (!path.includes('/') && path.endsWith('.md')) || path === '.github/PULL_REQUEST_TEMPLATE.md'
      || path === 'templates/README.md';
    full = paths.some((path) => !docsOnly(path));
  }
  const output = `full=${full}\n`;
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output, 'utf8');
  else process.stdout.write(output);
}
await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
