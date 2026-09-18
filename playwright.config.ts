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
    command: `pnpm validate:data && pnpm --filter @mirrorn/web exec vite --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
