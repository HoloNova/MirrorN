import { reportFailure, runNode, tools } from './run.ts';

/** CI 与维护者执行同一组正式门禁，任何一步失败即停止；只构建一次，不启动站点。 */
async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('Usage: pnpm check（无额外参数）');
  const commands = [
    ['scripts/check-docs.ts'],
    ['scripts/check-template.ts'],
    [tools.eslint, 'src', 'config', 'scripts', 'vite.config.ts', 'react-router.config.ts', 'eslint.config.js', '--max-warnings=0'],
    ['scripts/check-content.ts'],
    [tools.router, 'typegen'],
    [tools.tsc, '--noEmit'],
    [tools.router, 'build'],
    ['scripts/check-dist.ts'],
  ] as const;
  for (const command of commands) {
    process.stdout.write(`\n[check] ${command.join(' ')}\n`);
    await runNode(command, { ...process.env, MIRRORN_BUILD_MODE: 'preview' });
  }
}
await main().catch(reportFailure);
