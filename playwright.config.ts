import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 5199);
const baseURL = `http://127.0.0.1:${port}`;

/**
 * E2E 只覆盖真实浏览器才能验证的行为：键盘流程、输入法守卫、动效降级和窄屏布局。
 * 使用系统已安装的 Chrome（channel: 'chrome'），不额外下载浏览器；
 * 容器内以 root 运行需要 --no-sandbox，这与项目代码无关。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    channel: 'chrome',
    launchOptions: { args: ['--no-sandbox', '--disable-dev-shm-usage'] },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // --mode e2e 让 vite 把依赖预打包写到 node_modules/.vite-e2e，不碰 dev 的缓存。
    // VITE_API_BASE 显式打开状态接口（否则该模式按生产构建行为保持纯静态，不发请求）；
    // 具体响应仍由各用例的 page.route 提供，不依赖本机后端。
    command: `pnpm validate:data && VITE_API_BASE=/ pnpm --filter @mirrorn/web exec vite --port ${port} --strictPort --mode e2e`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
