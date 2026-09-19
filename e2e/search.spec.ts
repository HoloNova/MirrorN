import { expect, test, type Page } from '@playwright/test';

import { mockStatusUnavailable } from './api-mocks';

const SEARCH_INPUT = 'input[role="combobox"]';

/**
 * 用键盘把高亮移动到标题包含指定文字的结果上。
 * 只比较标题：镜像结果的外行文字里也会出现生态名称（"支持 Python / pip"），
 * 按整行匹配会把镜像误当成生态，导致回车只展开而不跳转。
 * 也刻意不假设排序：排序由相关性决定，测试只依赖"能到达并使用"。
 */
async function selectResultByKeyboard(page: Page, title: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.keyboard.press('ArrowDown');
    const activeTitle = page.locator('.search-hit.is-active .hit-title');
    if ((await activeTitle.innerText()).includes(title)) {
      await page.keyboard.press('Enter');
      return;
    }
  }
  throw new Error(`键盘未能选到标题包含「${title}」的结果`);
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  return errors;
}

test('只用键盘就能搜索并进入向导', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('/');
  await expect(page.locator(SEARCH_INPUT)).toBeFocused();

  await page.keyboard.type('python');
  await expect(page.locator('.search-results')).toBeVisible();
  await expect(page.locator('.search-hit')).not.toHaveCount(0);

  await selectResultByKeyboard(page, 'Python / pip');

  await expect(page).toHaveURL(/#\/ecosystems\/pip$/);
  await expect(page.locator('#step1-title')).toBeVisible();
});

test('搜索到镜像后给出该站可配置的生态入口', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('/');
  await page.keyboard.type('tuna');
  await expect(page.locator('.search-results')).toBeVisible();

  await selectResultByKeyboard(page, '清华大学开源软件镜像站');

  const chips = page.locator('.hit-chips .chip');
  // 清华同时提供 pip、apt 与 Docker CE 仓库，入口按生态顺序列出。
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toContainText('Ubuntu / apt');
  await expect(chips.nth(1)).toContainText('Docker CE / apt 仓库');
  await expect(chips.nth(2)).toContainText('Python / pip');

  await chips.nth(2).click();

  await expect(page).toHaveURL(/#\/ecosystems\/pip$/);
});

test('搜索 → 选择生态 → 切换来源 → 查看验证说明', async ({ page }) => {
  // 这个用例要进向导页，而向导会请求状态接口：显式模拟“后端可用但没有数据”，
  // 这样控制台不会出现未拦截请求的 404 噪声。
  await mockStatusUnavailable(page);

  const errors = collectPageErrors(page);

  // 搜索本身绝不能触发测速：进入生态页之前不应该有任何指向镜像站的请求。
  // （向导挂载后测速是预期行为，所以跳转到生态页时停止记录。）
  const probeRequests: string[] = [];
  let recording = true;
  page.on('request', (request) => {
    if (!recording || request.url().startsWith('http://127.0.0.1:')) {
      return;
    }
    probeRequests.push(request.url());
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && frame.url().includes('#/ecosystems/')) {
      recording = false;
    }
  });

  await page.goto('/');
  await page.keyboard.press('/');
  await page.keyboard.type('pip');
  await selectResultByKeyboard(page, 'Python / pip');

  await expect(page.locator('#step1-title')).toBeVisible();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.mirror-list')).toBeVisible();

  await page.locator('.mirror-list button', { hasText: '清华大学' }).click();
  const command = page.locator('.command-block code').first();
  await expect(command).toContainText('mirrors.tuna.tsinghua.edu.cn');
  await expect(command).toContainText('<包名>');

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('#step3-title')).toBeVisible();
  await expect(page.locator('.command-block code').first()).toContainText('pip config get');

  expect(probeRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('Escape 清空搜索并回到空态', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('/');
  await page.keyboard.type('npm');
  await expect(page.locator('.search-results')).toBeVisible();
  await expect(page.locator('.hero')).toHaveClass(/is-searching/);

  await page.keyboard.press('Escape');
  await expect(page.locator(SEARCH_INPUT)).toHaveValue('');
  await expect(page.locator('.search-results')).toBeHidden();
  await expect(page.locator('.hero')).not.toHaveClass(/is-searching/);
});

test('输入法组词期间回车不会跳转', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('/');
  const input = page.locator(SEARCH_INPUT);

  await input.fill('python');
  await expect(page.locator('.search-hit').first()).toBeVisible();

  // 无头浏览器无法使用真实输入法，这里按标准事件序列模拟组词状态。
  await input.dispatchEvent('compositionstart');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/$/);

  await input.dispatchEvent('compositionend');
  await expect(page.locator('.search-hit').first()).toBeVisible();
  await selectResultByKeyboard(page, 'Python / pip');
  await expect(page).toHaveURL(/#\/ecosystems\/pip$/);
});

test('窄屏不出现整页横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto('/');
  await page.keyboard.press('/');
  await page.keyboard.type('tuna');
  await expect(page.locator('.search-results')).toBeVisible();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('关闭动画后功能仍然完整', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('/');
  await page.keyboard.type('npm');
  await selectResultByKeyboard(page, 'Node.js / npm');

  await expect(page).toHaveURL(/#\/ecosystems\/npm$/);
  await expect(page.locator('#step1-title')).toBeVisible();
});
