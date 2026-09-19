import { expect, test } from '@playwright/test';

import { mirrorsPayload, mockFingerprint, mockStatus } from './api-mocks';

/**
 * 同步状态在 E2E 里由 page.route 模拟：既不依赖本机后端，也不依赖上游可用性
 * （PLAN 5 验收要求：CI 不依赖上游实时可用）。
 *
 * e2e 的 vite 以 `--mode e2e` 启动，没有 /api 代理；未拦截时请求会 404 并走降级路径，
 * 这本身也是我们要覆盖的行为之一（见最后一个用例）。
 */

test('步骤 2 展示各来源的同步状态，并标出官方源与未提供状态的来源', async ({ page }) => {
  await mockStatus(
    page,
    mirrorsPayload([
      {
        mirrorId: 'tsinghua',
        status: 'success',
        lastSuccessAt: 1_799_998_000_000,
      },
    ]),
  );
  await mockFingerprint(page, { available: false, computedAt: 1, reason: '未配置指纹 secret' });

  await page.goto('/#/ecosystems/pip');
  await page.getByRole('button', { name: '下一步' }).click();

  const tuna = page.locator('.mirror-list button').filter({ hasText: '清华大学' });
  await expect(tuna.locator('.sync-status')).toContainText('已同步');
  await expect(tuna.locator('.sync-status')).toContainText('最近一次同步成功');

  const official = page.locator('.mirror-list button').filter({ hasText: 'PyPI 官方源' });
  await expect(official.locator('.sync-status')).toContainText('官方源');

  const aliyun = page.locator('.mirror-list button').filter({ hasText: '阿里云' });
  await expect(aliyun.locator('.sync-status')).toContainText('同步状态未知');
  await expect(aliyun.locator('.sync-status')).toContainText('没有公开可核实的同步状态接口');

  // 数据来源与更新时间也必须展示（PLAN 5.3）。
  await expect(
    page.locator('.panel-note').filter({ hasText: '同步状态来自后端聚合' }),
  ).toBeVisible();
});

test('同步失败的来源不会被自动推荐，但仍然可以手动选择', async ({ page }) => {
  // 让清华同步失败：即使它测得更快，也不应成为默认来源。
  await mockStatus(
    page,
    mirrorsPayload([{ mirrorId: 'tsinghua', status: 'failed', lastSuccessAt: 1_700_000_000_000 }]),
  );
  await mockFingerprint(page, { available: false, computedAt: 1 });

  await page.route('https://mirrors.tuna.tsinghua.edu.cn/robots.txt*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' }),
  );
  await page.route('https://pypi.org/robots.txt*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
  });
  await page.route('https://mirrors.aliyun.com/robots.txt*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
  });

  await page.goto('/#/ecosystems/pip');
  await page.getByRole('button', { name: '下一步' }).click();

  await expect(page.locator('.probe-badge').first()).toContainText('响应耗时（估算）', {
    timeout: 10_000,
  });

  const tuna = page.locator('.mirror-list button').filter({ hasText: '清华大学' });
  await expect(tuna.locator('.sync-status')).toContainText('同步失败');

  const recommended = page.locator('.mirror-list button').filter({ hasText: '推荐' });
  await expect(recommended).toHaveCount(1);
  await expect(recommended).not.toContainText('清华大学');

  // 手动选择仍然有效，且命令随之改变。
  await tuna.click();
  await expect(tuna).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.command-body').first()).toContainText(
    'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/',
  );
});

test('后端不可用时按未知展示，向导本身仍然完整可用', async ({ page }) => {
  // 不拦截 /api：e2e 的 vite 没有代理，请求会 404，前端必须降级而不是报错。
  await page.route('https://mirrors.tuna.tsinghua.edu.cn/robots.txt*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' }),
  );

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/#/ecosystems/pip');
  await page.getByRole('button', { name: '下一步' }).click();

  const tuna = page.locator('.mirror-list button').filter({ hasText: '清华大学' });
  await expect(tuna.locator('.sync-status')).toContainText('同步状态未知');

  // 命令生成、步骤切换都不受影响。
  await expect(page.locator('.command-body').first()).toContainText(
    'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/',
  );
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByRole('heading', { name: /步骤 3/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('数据可能过期时明确标注，不把旧状态伪装成当前状态', async ({ page }) => {
  await mockStatus(
    page,
    mirrorsPayload(
      [{ mirrorId: 'tsinghua', status: 'success', lastSuccessAt: 1_799_998_000_000 }],
      true,
    ),
  );
  await mockFingerprint(page, { available: false, computedAt: 1 });

  await page.goto('/#/ecosystems/pip');
  await page.getByRole('button', { name: '下一步' }).click();

  await expect(page.locator('.panel-note').filter({ hasText: '数据可能已过期' })).toBeVisible();
});
