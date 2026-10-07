import { defineConfig } from 'astro/config';
import type { AstroIntegration } from 'astro';
import { siteConfig, siteConfigWarnings } from './config/site';
import { contentIntegration } from './src/content/integration.ts';

/**
 * 为什么有站点配置提示：正式域名和贡献仓库属于发布前才确定的值，P1 允许它们为空。
 * 这里在每次 dev / build / preview 启动时把缺失项讲清楚，避免等到页面出现空链接才发现。
 */
const siteConfigHints: AstroIntegration = {
  name: 'mirrorn-site-config-hints',
  hooks: {
    'astro:config:setup': ({ logger }) => {
      for (const warning of siteConfigWarnings) {
        logger.warn(warning);
      }
    },
  },
};

export default defineConfig({
  // 纯静态输出：产物是可直接托管的 HTML，不需要 Node 常驻服务。
  output: 'static',
  // 只有配置了正式地址才输出 canonical 等绝对地址；未配置时保持 undefined，不伪造域名。
  site: siteConfig.siteUrl ?? undefined,
  integrations: [siteConfigHints, contentIntegration()],
  vite: {
    server: {
      watch: {
        // 归档、本地数据与 agent 状态不属于站点范围，不参与文件监听，避免开发启动时扫描历史目录。
        ignored: ['**/archive/**', '**/.local/**', '**/.pi/**'],
      },
    },
  },
});
