import { requireReleaseSite } from '../config/deployment.ts';
import { siteConfig } from '../config/site.ts';
import { sourceRevision } from '../src/delivery/manifest.ts';
import { projectRoot, reportFailure, runNode, tools } from './run.ts';

/** 只生成并检查正式产物，不上传、不切换线上版本。 */
async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('Usage: pnpm build:release（无额外参数）');
  requireReleaseSite(siteConfig.siteUrl);
  const revision = await sourceRevision(projectRoot);
  if (!revision.commit || revision.dirty !== false) throw new Error('正式构建需要已提交的干净 Git 修订。');
  await runNode([tools.router, 'build'], { ...process.env, MIRRORN_BUILD_MODE: 'release' });
  await runNode(['scripts/check-dist.ts']);
}
await main().catch(reportFailure);
