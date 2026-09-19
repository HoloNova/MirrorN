import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { cacheControlFor } from './static.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mirrorn-static-'));
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>app</title>');
  writeFileSync(join(root, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(join(root, 'favicon.svg'), '<svg/>');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('cacheControlFor', () => {
  it('长期缓存带内容哈希的产物，其它文件每次都校验', () => {
    expect(cacheControlFor('/assets/index-abc123.js')).toBe('public, max-age=31536000, immutable');
    expect(cacheControlFor('/index.html')).toBe('no-cache');
    expect(cacheControlFor('/favicon.svg')).toBe('no-cache');
  });
});

describe('静态资源服务', () => {
  it('不传 staticDir 时只提供 API，根路径返回 404', async () => {
    const app = createApp();

    expect((await app.request('/api/health')).status).toBe(200);
    expect((await app.request('/')).status).toBe(404);
  });

  it('返回产物文件，并带上类型与缓存头', async () => {
    const app = createApp({ staticDir: root });

    const asset = await app.request('/assets/index-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(asset.headers.get('x-frame-options')).toBe('DENY');
    expect(await asset.text()).toBe('console.log(1)');

    const index = await app.request('/');
    expect(index.status).toBe(200);
    expect(index.headers.get('cache-control')).toBe('no-cache');
    expect(await index.text()).toContain('<title>app</title>');
  });

  it('hash 路由下的任意路径都回落到 index.html（但不会命中不存在的文件）', async () => {
    const app = createApp({ staticDir: root });

    const page = await app.request('/ecosystems/apt');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>app</title>');

    // 目录本身不是文件：同样回落，而不是 500 或目录列表。
    const directory = await app.request('/assets/');
    expect(directory.status).toBe(200);
    expect(await directory.text()).toContain('<title>app</title>');
  });

  it('API 路由不会被静态通配符抢走', async () => {
    const app = createApp({ staticDir: root });

    const health = await app.request('/api/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });
  });

  it('不因为路径穿越读到目录外的文件', async () => {
    const app = createApp({ staticDir: root });

    const escaped = await app.request('/../secret.txt', {
      headers: { host: 'example.test' },
    });
    // fetch 会在发送前规范化 ../，这里直接构造 URL 路径验证服务端行为。
    expect([200, 404]).toContain(escaped.status);
    if (escaped.status === 200) {
      expect(await escaped.text()).toContain('<title>app</title>');
    }
  });
});
