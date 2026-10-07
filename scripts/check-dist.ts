import { join } from 'node:path';
import { checkDist } from '../src/delivery/check.ts';
import { projectRoot, reportFailure } from './run.ts';

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('Usage: pnpm check:dist（检查当前 dist，无额外参数）');
  const result = await checkDist(projectRoot, join(projectRoot, 'dist'));
  process.stdout.write(`产物校验通过：${result.mode}，${result.files} 文件，${result.resources} 公开资源，${result.references} 本地引用。\n产物 SHA256：${result.artifactHash}\n`);
}
await main().catch(reportFailure);
