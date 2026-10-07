import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { buildMode, releaseSiteUrl } from '../../config/deployment.ts';
import { siteConfig } from '../../config/site.ts';
import { loadResourceRegistry } from '../content/registry/load.ts';
import { contentDigest, sourceRevision, writeBuildManifest } from './manifest.ts';

/** 记录完整产物，不能用 Git 提交号冒充文件字节验证，也不包含原始私有路径。 */
export function deliveryIntegration(): AstroIntegration {
  let projectRoot = '';
  let startedContent = '';
  let startedCommit: string | null = null;
  return {
    name: 'mirrorn-delivery',
    hooks: {
      'astro:config:done': ({ config }) => { projectRoot = fileURLToPath(config.root); },
      'astro:build:start': async () => {
        const registry = await loadResourceRegistry(projectRoot, { siteUrl: siteConfig.siteUrl });
        startedContent = contentDigest(registry);
        if (buildMode === 'release') {
          const revision = await sourceRevision(projectRoot);
          if (!revision.commit || revision.dirty !== false) throw new Error('正式构建需要已提交的干净 Git 修订。');
          startedCommit = revision.commit;
        }
      },
      'astro:build:done': async ({ dir, logger }) => {
        const registry = await loadResourceRegistry(projectRoot, { siteUrl: siteConfig.siteUrl });
        if (contentDigest(registry) !== startedContent) throw new Error('构建期间资源集合发生变化，请重新构建。');
        const manifest = await writeBuildManifest(projectRoot, fileURLToPath(dir), registry, buildMode, releaseSiteUrl);
        if (startedCommit && manifest.commit !== startedCommit) throw new Error('构建期间 Git 修订发生变化，不能发布此产物。');
        logger.info(`${buildMode} 产物 ${manifest.artifactHash.slice(0, 12)}；${manifest.files.length} 文件。`);
      },
    },
  };
}
