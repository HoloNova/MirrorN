import { describe, expect, it } from 'vitest';

import type { MirrorsStatusResponse } from '@mirrorn/shared';

import { createApp } from './app.js';
import type { StatusStore } from './state/statusStore.js';

describe('health route', () => {
  it('returns a stable service health payload', async () => {
    const response = await createApp().request('http://localhost/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'mirrorn-server',
      dataSchemaVersion: 1,
    });
  });
});

describe('mirrors status route', () => {
  it('returns an empty, stale payload when no store is wired up', async () => {
    const response = await createApp({ now: () => 1_800_000_000_000 }).request(
      'http://localhost/api/mirrors',
    );

    expect(response.status).toBe(200);
    // 不把“没有数据”说成实时状态：stale 为 true、items 为空。
    await expect(response.json()).resolves.toEqual({
      generatedAt: 1_800_000_000_000,
      stale: true,
      items: [],
      sources: [],
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns whatever the store reports and never lets it be cached', async () => {
    const payload: MirrorsStatusResponse = {
      generatedAt: 1,
      fetchedAt: 2,
      stale: false,
      items: [
        {
          mirrorId: 'mirror-a',
          ecosystemId: 'pip',
          status: 'syncing',
          sourceUrl: 'https://mirror.example/tunasync.json',
          job: 'pypi',
        },
      ],
      sources: [{ url: 'https://mirror.example/tunasync.json', ok: true }],
    };
    const store = { read: () => payload } as unknown as StatusStore;

    const response = await createApp({ status: store }).request('http://localhost/api/mirrors');

    await expect(response.json()).resolves.toEqual(payload);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('network fingerprint route', () => {
  it('reports unavailable when no secret is configured', async () => {
    const response = await createApp({ now: () => 42 }).request(
      'http://localhost/api/net-fingerprint',
    );

    await expect(response.json()).resolves.toEqual({
      available: false,
      computedAt: 42,
      reason: '未配置指纹 secret',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('ignores a spoofed X-Forwarded-For when no trusted proxy is declared', async () => {
    const response = await createApp({
      fingerprint: { secret: 'secret', trustProxy: false },
    }).request('http://localhost/api/net-fingerprint', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });

    await expect(response.json()).resolves.toMatchObject({
      available: false,
      reason: '拿不到可靠的客户端地址',
    });
  });

  it('uses the address appended by the trusted proxy, not the client-supplied one', async () => {
    const spoofed = await createApp({
      fingerprint: { secret: 'secret', trustProxy: true },
    }).request('http://localhost/api/net-fingerprint', {
      headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.45' },
    });

    const honest = await createApp({
      fingerprint: { secret: 'secret', trustProxy: true },
    }).request('http://localhost/api/net-fingerprint', {
      headers: { 'x-forwarded-for': '203.0.113.45' },
    });

    const spoofedBody = (await spoofed.json()) as { available: boolean; fingerprint?: string };
    const honestBody = (await honest.json()) as { available: boolean; fingerprint?: string };

    expect(spoofedBody.available).toBe(true);
    expect(spoofedBody.fingerprint).toBe(honestBody.fingerprint);
    expect(spoofedBody.fingerprint).not.toContain('203.0.113');
  });
});
