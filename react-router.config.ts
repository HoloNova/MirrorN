import { join } from 'node:path';
import type { Config } from '@react-router/dev/config';
import { siteConfig } from './config/site.ts';
import { buildMode } from './config/deployment.ts';
import { loadResourceRegistry } from './src/content/registry/load.ts';
import { contentDigest, sourceRevision } from './src/delivery/manifest.ts';
import { finishStaticBuild } from './src/delivery/integration.ts';

let startedContent: string | undefined;
let startedCommit: string | null = null;
export default {
  appDirectory: 'src',
  buildDirectory: '.local/react-router-build',
  ssr: false,
  routeDiscovery: { mode: 'initial' },
  async prerender() {
    const registry = await loadResourceRegistry(process.cwd(), { siteUrl: siteConfig.siteUrl });
    startedContent = contentDigest(registry);
    if (buildMode === 'release') {
      const revision = await sourceRevision(process.cwd());
      if (!revision.commit || revision.dirty !== false) throw new Error('正式构建需要已提交的干净 Git 修订。');
      startedCommit = revision.commit;
    }
    return ['/', '/resources/', '/about/', '/404.html', ...registry.resources.map((resource) => `/resources/${resource.metadata.id}/`)];
  },
  async buildEnd({ reactRouterConfig }) {
    if (!startedContent) throw new Error('没有经过公开集合预渲染，不能生成发布产物。');
    await finishStaticBuild(process.cwd(), join(reactRouterConfig.buildDirectory, 'client'), startedContent, startedCommit);
  },
} satisfies Config;
