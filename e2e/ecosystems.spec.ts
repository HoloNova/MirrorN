import { expect, test } from '@playwright/test';

import { mockStatusUnavailable } from './api-mocks';

/**
 * 阶段 6 新增的生态（apt / Docker CE / Docker Hub 加速）在真实页面里的行为。
 *
 * 重点覆盖三件事：
 *   1. 版本选择器真的会切换生成的命令与配置文件内容（24.04 的 deb822 与 22.04 的 sources.list 不同）；
 *   2. 未列出的版本不会被“猜”出来（数据里没有的版本根本不可选）；
 *   3. Docker CE 与 Docker Hub 加速是两件事，页面上必须说清楚。
 */

test('apt：切换 Ubuntu 版本会同时切换配置格式与文件路径', async ({ page }) => {
  await mockStatusUnavailable(page);

  await page.goto('/#/ecosystems/apt');

  // 进入向导后是步骤 1：应出现版本选择器，且默认是最新列出的 LTS。
  const versionGroup = page.locator('.option-grid').filter({ hasText: 'Ubuntu 24.04' });
  await expect(versionGroup).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Ubuntu 24.04' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: /配置文件/ }).click();

  // 24.04 用 deb822：路径是 ubuntu.sources，内容是 Types/URIs/Suites。
  await expect(page.locator('.config-file')).toContainText(
    '/etc/apt/sources.list.d/ubuntu.sources',
  );
  const content = page.locator('.config-file .command-body').first();
  await expect(content).toContainText('Types: deb');
  await expect(content).toContainText('Suites: noble noble-updates noble-backports');
  await expect(content).toContainText('https://security.ubuntu.com/ubuntu/');

  // 切回步骤 1 选 22.04：路径与格式都要跟着变。
  await page.getByRole('button', { name: '上一步' }).click();
  await page.getByRole('button', { name: 'Ubuntu 22.04' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: /配置文件/ }).click();

  await expect(page.locator('.config-file')).toContainText('/etc/apt/sources.list');
  const older = page.locator('.config-file .command-body').first();
  // 具体镜像取决于测速推荐（每次运行可能不同），这里只断言与版本/格式相关的部分。
  await expect(older).toContainText(
    /deb https:\/\/[^\s]+\/ubuntu\/ jammy main restricted universe multiverse/,
  );
  await expect(older).toContainText('jammy-backports');
  await expect(older).toContainText('deb https://security.ubuntu.com/ubuntu/ jammy-security');
  await expect(older).not.toContainText('Types: deb');
});

test('apt：只列出数据里声明过的 LTS 版本，不提供其它版本', async ({ page }) => {
  await mockStatusUnavailable(page);
  await page.goto('/#/ecosystems/apt');

  await expect(page.getByRole('button', { name: 'Ubuntu 24.04' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ubuntu 22.04' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ubuntu 20.04' })).toBeVisible();
  // 未收录的版本（例如 23.10 或 25.04）不能出现，避免用户误以为支持。
  await expect(page.getByRole('button', { name: 'Ubuntu 23.10' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ubuntu 25.04' })).toHaveCount(0);

  // 官方文档入口必须在页面上可见（PLAN 6.1：未支持的发行版/架构给出官方入口）。
  const docs = page.locator('.source-links');
  await expect(docs).toContainText('https://ubuntu.com/server/docs/package-management');
  await expect(docs).toContainText('ubuntu-ports');
});

test('Docker：软件仓库换源与 Hub 加速是两项不同的配置', async ({ page }) => {
  await mockStatusUnavailable(page);

  // 1) Docker CE 仓库换源：给出 apt 仓库文件，并明确说明不等于镜像加速。
  await page.goto('/#/ecosystems/docker-ce');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: /配置文件/ }).click();
  await expect(page.locator('.config-file')).toContainText(
    '/etc/apt/sources.list.d/docker.sources',
  );
  await expect(page.locator('.config-file .command-body').first()).toContainText(
    'Signed-By: /etc/apt/keyrings/docker.gpg',
  );
  await expect(page.locator('.prerequisites')).toContainText('不是');
  await expect(page.locator('.prerequisites')).toContainText('Docker Hub');

  // 2) Hub 加速：只有 daemon.json 的合并方式，不整份覆盖，也不提供任何加速地址。
  await page.goto('/#/ecosystems/dockerhub');
  await page.getByRole('button', { name: '下一步' }).click();
  const command = page.locator('.command-body').first();
  await expect(command).toContainText('/etc/docker/daemon.json');
  await expect(command).toContainText('<你的加速地址>');
  await expect(command).toContainText('daemon.json.mirrorn.bak');
  await expect(page.locator('.prerequisites')).toContainText('不提供任何公共加速地址');

  // 验证步骤要提醒：加速只作用于 Docker Hub。
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('#step3-title')).toBeVisible();
  await expect(page.locator('.command-body').first()).toContainText('RegistryConfig.Mirrors');
  await expect(page.locator('.expectation')).toContainText('空数组或 null');
});
