import { type Page } from '@playwright/test';

/**
 * `/api/*` 的共用模拟。
 *
 * 为什么需要：e2e 的 vite 以 `--mode e2e` 启动，用 `VITE_API_BASE=/` 打开状态接口，
 * 但没有反向代理——未拦截的 `/api/...` 会返回 404，浏览器控制台因此出现
 * “Failed to load resource: 404”。功能上页面会正常降级（这也是我们单独覆盖的一条路径），
 * 但在其它用例里它只是噪声，会污染“控制台无报错”的断言。因此每个进入向导的用例
 * 都显式声明自己期望的后端行为。
 */

const MIRRORS_URL = '**/api/mirrors';
const FINGERPRINT_URL = '**/api/net-fingerprint';

export const TUNA_STATUS_URL = 'https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json';

export interface StatusItemOverride {
  mirrorId: string;
  status?: string;
  lastSuccessAt?: number;
}

export function mirrorsPayload(items: StatusItemOverride[] = [], stale = false) {
  return {
    generatedAt: 1_800_000_000_000,
    fetchedAt: 1_799_999_000_000,
    stale,
    items: items.map((item) => ({
      ecosystemId: 'pip',
      status: 'success',
      sourceUrl: TUNA_STATUS_URL,
      job: 'pypi',
      ...item,
    })),
    sources: [
      {
        url: TUNA_STATUS_URL,
        ok: true,
        recordCount: 182,
        fetchedAt: 1_799_999_000_000,
      },
    ],
  };
}

export async function mockStatus(
  page: Page,
  payload: unknown,
  options: { status?: number } = {},
): Promise<void> {
  await page.route(MIRRORS_URL, async (route) => {
    await route.fulfill({
      status: options.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

export async function mockFingerprint(page: Page, payload: unknown): Promise<void> {
  await page.route(FINGERPRINT_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

/**
 * 后端“可用但没有数据”的常规情况：状态接口返回空列表，指纹不可用。
 * 适合不关心同步状态、只想让页面安静运行的用例。
 */
export async function mockStatusUnavailable(page: Page): Promise<void> {
  await mockStatus(page, mirrorsPayload([], true));
  await mockFingerprint(page, {
    available: false,
    computedAt: 1,
    reason: 'e2e：未配置指纹 secret',
  });
}
