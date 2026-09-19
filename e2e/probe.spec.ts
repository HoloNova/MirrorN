import { expect, test, type Page } from '@playwright/test';

const PROBE_ROUTES = {
  pypi: 'https://pypi.org/robots.txt*',
  npmjs: 'https://registry.npmjs.org/-/ping*',
  tuna: 'https://mirrors.tuna.tsinghua.edu.cn/robots.txt*',
  aliyun: 'https://mirrors.aliyun.com/robots.txt*',
  npmmirror: 'https://registry.npmmirror.com/-/ping*',
  tencent: 'https://mirrors.tencent.com/npm/-/ping*',
} as const;

/**
 * 探针在 E2E 里全部由 page.route 模拟：真实网络的耗时不稳定，也不能让 CI 依赖上游可用性。
 * 刻意不返回 Access-Control-Allow-Origin，这样浏览器拿到的是 opaque 响应，
 * 与 no-cors 探针在真实环境里的行为一致，界面必须显示“内容未验证”。
 */
async function mockProbe(
  page: Page,
  pattern: string,
  options: { delayMs?: number; status?: number } = {},
): Promise<void> {
  await page.route(pattern, async (route) => {
    if (options.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    try {
      await route.fulfill({
        status: options.status ?? 200,
        contentType: 'text/plain',
        body: 'ok',
      });
    } catch {
      // 页面超时熔断后请求已经被取消，这里不需要再回应。
    }
  });
}

test('在向导里显示响应耗时估算，并把推荐来源设为默认', async ({ page }) => {
  await mockProbe(page, PROBE_ROUTES.pypi, { delayMs: 400 });
  await mockProbe(page, PROBE_ROUTES.tuna, { delayMs: 30 });
  await mockProbe(page, PROBE_ROUTES.aliyun, { delayMs: 600 });

  await page.goto('/#/ecosystems/pip');
  // 测量在进入生态页时就开始，但徽标在步骤 2 的来源列表里。
  await page.getByRole('button', { name: '下一步' }).click();

  const measured = page.locator('.probe-badge', { hasText: '响应耗时（估算）' }).first();
  await expect(measured).toBeVisible({ timeout: 10_000 });
  await expect(measured).toContainText('响应完成，内容未验证');

  // 最快的不是列表里的第一项，默认来源要跟着推荐走。
  const recommended = page.locator('.mirror-list button').filter({ hasText: '推荐' });
  await expect(recommended).toHaveCount(1);
  await expect(recommended).toContainText('清华大学');
  await expect(recommended).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.command-body').first()).toContainText(
    'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/',
  );
});

test('超时的来源显示超时，并且不会被推荐', async ({ page }) => {
  await mockProbe(page, PROBE_ROUTES.pypi, { delayMs: 30 });
  await mockProbe(page, PROBE_ROUTES.tuna, { delayMs: 4000 });
  await mockProbe(page, PROBE_ROUTES.aliyun, { delayMs: 60 });

  await page.goto('/#/ecosystems/pip');
  await page.getByRole('button', { name: '下一步' }).click();

  const tunaRow = page.locator('.mirror-list button').filter({ hasText: '清华大学' });
  // 请求还没返回时先显示“测试中”；这里不断言一定能捕捉到那一瞬间，只保证两者之一出现。
  await expect(tunaRow.locator('.probe-badge')).toContainText(/测试中|超时/);
  await expect(tunaRow.locator('.probe-badge')).toContainText('超时', { timeout: 10_000 });

  const recommended = page.locator('.mirror-list button').filter({ hasText: '推荐' });
  await expect(recommended).toHaveCount(1);
  await expect(recommended).not.toContainText('清华大学');
});

test('用户手动选过来源之后，重新测量不会替换选择和命令', async ({ page }) => {
  await mockProbe(page, PROBE_ROUTES.pypi, { delayMs: 20 });
  await mockProbe(page, PROBE_ROUTES.tuna, { delayMs: 40 });
  await mockProbe(page, PROBE_ROUTES.aliyun, { delayMs: 60 });

  await page.goto('/#/ecosystems/pip');
  await page.getByRole('button', { name: '下一步' }).click();

  const aliyunRow = page.locator('.mirror-list button').filter({ hasText: '阿里云' });
  await aliyunRow.click();
  await expect(aliyunRow).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.command-body').first()).toContainText('mirrors.aliyun.com');

  await page.getByRole('button', { name: '重新测量' }).click();
  await expect(page.locator('.probe-badge', { hasText: '响应耗时（估算）' }).first()).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForTimeout(500);

  await expect(aliyunRow).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.command-body').first()).toContainText('mirrors.aliyun.com');
  await expect(page.locator('.panel-note').filter({ hasText: '不会自动替换' })).toBeVisible();
});

test('搜索只显示向导里已经测到的估算值', async ({ page }) => {
  await mockProbe(page, PROBE_ROUTES.pypi, { delayMs: 20 });
  await mockProbe(page, PROBE_ROUTES.tuna, { delayMs: 40 });
  await mockProbe(page, PROBE_ROUTES.aliyun, { delayMs: 60 });

  await page.goto('/#/ecosystems/pip');
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.probe-badge', { hasText: '响应耗时（估算）' }).first()).toBeVisible({
    timeout: 10_000,
  });

  await page.goto('/');
  await page.keyboard.press('/');
  await page.keyboard.type('tuna');

  const latency = page.locator('.hit-latency');
  await expect(latency.first()).toBeVisible();
  await expect(latency.first()).toContainText('≈');
});
