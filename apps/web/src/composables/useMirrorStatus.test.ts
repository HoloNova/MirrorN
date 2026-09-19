import { describe, expect, it } from 'vitest';

import type { MirrorsStatusResponse, NetFingerprintResponse } from '@mirrorn/shared/sync';

import type { StatusClient } from '../lib/statusApi';
import {
  createMirrorStatusAccess,
  resolveApiBase,
  type MirrorStatusOptions,
  type StatusEnv,
} from './useMirrorStatus';

function mirrorsResponse(overrides: Partial<MirrorsStatusResponse> = {}): MirrorsStatusResponse {
  return {
    generatedAt: 1_800_000_000_000,
    fetchedAt: 1_799_999_000_000,
    stale: false,
    items: [
      {
        mirrorId: 'tuna',
        ecosystemId: 'pip',
        status: 'success',
        lastSuccessAt: 1_799_998_000_000,
        job: 'pypi',
        sourceUrl: 'https://mirror.example/tunasync.json',
      },
    ],
    sources: [{ url: 'https://mirror.example/tunasync.json', ok: true }],
    ...overrides,
  };
}

function fingerprintResponse(
  overrides: Partial<NetFingerprintResponse> = {},
): NetFingerprintResponse {
  return { available: true, fingerprint: 'aaaa', computedAt: 1, ...overrides };
}

function fakeClient(handlers: {
  mirrors?: () => Promise<MirrorsStatusResponse | undefined>;
  fingerprint?: () => Promise<NetFingerprintResponse | undefined>;
}): { client: StatusClient; calls: { mirrors: number; fingerprint: number } } {
  const calls = { mirrors: 0, fingerprint: 0 };
  return {
    calls,
    client: {
      baseUrl: '/',
      fetchMirrors: async () => {
        calls.mirrors += 1;
        return handlers.mirrors ? await handlers.mirrors() : undefined;
      },
      fetchFingerprint: async () => {
        calls.fingerprint += 1;
        return handlers.fingerprint ? await handlers.fingerprint() : undefined;
      },
    },
  };
}

/** 手动触发“页面重新可见”的假环境。 */
function fakeEnv(): StatusEnv & { emitVisible: () => void } {
  let handler: (() => void) | undefined;
  return {
    subscribe: (handlers) => {
      handler = handlers.onVisible;
      return () => {
        handler = undefined;
      };
    },
    emitVisible: () => handler?.(),
  };
}

function makeAccess(options: Partial<MirrorStatusOptions> = {}, now = 1_000) {
  const env = options.env ?? fakeEnv();
  const access = createMirrorStatusAccess({
    baseUrl: '/',
    env,
    now: () => now,
    autoStart: false,
    ...options,
  });
  return { access, env };
}

describe('resolveApiBase', () => {
  it('uses the configured base url and trims it', () => {
    expect(resolveApiBase({ VITE_API_BASE: ' https://api.example ' })).toBe('https://api.example');
    expect(resolveApiBase({ VITE_API_BASE: '/' })).toBe('/');
  });

  it('returns undefined for a production build without configuration (static mode)', () => {
    // 生产构建里 import.meta.env.DEV 为 false，未配置时不请求任何接口。
    expect(resolveApiBase({})).toBe(import.meta.env.DEV ? '/' : undefined);
  });
});

describe('createMirrorStatusAccess', () => {
  it('does nothing at all when no base url is configured', async () => {
    const { client, calls } = fakeClient({});
    const { access } = makeAccess({ baseUrl: undefined, client });

    expect(access.enabled).toBe(false);
    expect(access.statusFor('tuna', 'pip')).toBe('unknown');
    await access.refresh(true);
    await access.checkFingerprint(true);

    expect(calls).toEqual({ mirrors: 0, fingerprint: 0 });
    expect(access.fingerprint.value).toBe('disabled');
  });

  it('exposes records keyed by mirror and ecosystem', async () => {
    const { client } = fakeClient({ mirrors: async () => mirrorsResponse() });
    const { access } = makeAccess({ client });

    await access.refresh(true);

    expect(access.statusFor('tuna', 'pip')).toBe('success');
    expect(access.statusFor('tuna', 'npm')).toBe('unknown');
    expect(access.recordFor('tuna', 'pip')?.job).toBe('pypi');
    expect(access.meta.value).toMatchObject({ stale: false, fetchedAt: 1_799_999_000_000 });
  });

  it('keeps the previous data when a refresh fails', async () => {
    let fail = false;
    const { client } = fakeClient({
      mirrors: async () => (fail ? undefined : mirrorsResponse()),
    });
    const { access } = makeAccess({ client });

    await access.refresh(true);
    fail = true;
    await access.refresh(true);

    expect(access.statusFor('tuna', 'pip')).toBe('success');
  });

  it('respects the minimum refresh interval unless forced', async () => {
    const { client, calls } = fakeClient({ mirrors: async () => mirrorsResponse() });
    const { access } = makeAccess({ client, minRefreshIntervalMs: 60_000 });

    await access.refresh(true);
    await access.refresh(false);
    await access.refresh(false);
    expect(calls.mirrors).toBe(1);

    await access.refresh(true);
    expect(calls.mirrors).toBe(2);
  });

  it('re-checks on page visibility but not more often than the interval', async () => {
    const { client, calls } = fakeClient({
      mirrors: async () => mirrorsResponse(),
      fingerprint: async () => fingerprintResponse(),
    });
    const env = fakeEnv();
    makeAccess({ client, env, minRefreshIntervalMs: 60_000 });

    env.emitVisible();
    await Promise.resolve();
    env.emitVisible();
    await Promise.resolve();

    // 第一次可见触发刷新，第二次被最小间隔挡住。
    expect(calls.mirrors).toBe(1);
    expect(calls.fingerprint).toBe(1);
  });
});

describe('fingerprint handling', () => {
  it('reports unavailable instead of pretending the network is unchanged', async () => {
    const changes: number[] = [];
    const { client } = fakeClient({
      fingerprint: async () => fingerprintResponse({ available: false, fingerprint: undefined }),
    });
    const { access } = makeAccess({ client, onFingerprintChange: () => changes.push(1) });

    await expect(access.checkFingerprint(true)).resolves.toBe(false);
    expect(access.fingerprint.value).toBe('unknown');
    expect(changes).toEqual([]);
  });

  it('does not invalidate anything on the first successful value', async () => {
    const changes: number[] = [];
    const { client } = fakeClient({ fingerprint: async () => fingerprintResponse() });
    const { access } = makeAccess({ client, onFingerprintChange: () => changes.push(1) });

    await access.checkFingerprint(true);

    expect(access.fingerprint.value).toBe('available');
    expect(changes).toEqual([]);
  });

  it('invalidates cached measurements when the fingerprint changes', async () => {
    const changes: number[] = [];
    let value = 'aaaa';
    const { client } = fakeClient({
      fingerprint: async () => fingerprintResponse({ fingerprint: value }),
    });
    const { access } = makeAccess({ client, onFingerprintChange: () => changes.push(1) });

    await access.checkFingerprint(true);
    await access.checkFingerprint(true);
    expect(changes).toEqual([]);

    value = 'bbbb';
    await expect(access.checkFingerprint(true)).resolves.toBe(true);
    expect(changes).toEqual([1]);
  });
});
