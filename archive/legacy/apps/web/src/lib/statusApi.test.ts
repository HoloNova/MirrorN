import { describe, expect, it, vi } from 'vitest';

import {
  createStatusClient,
  FINGERPRINT_WAIT_MS,
  parseFingerprintResponse,
  parseMirrorsResponse,
  waitForFingerprint,
} from './statusApi';

const validResponse = {
  generatedAt: 1_800_000_000_000,
  fetchedAt: 1_799_999_999_000,
  stale: false,
  items: [
    {
      mirrorId: 'tsinghua',
      ecosystemId: 'pip',
      status: 'success',
      lastSuccessAt: 1_799_999_000_000,
      job: 'pypi',
      sourceUrl: 'https://mirror.example/tunasync.json',
    },
  ],
  sources: [{ url: 'https://mirror.example/tunasync.json', ok: true, recordCount: 182 }],
};

describe('parseMirrorsResponse', () => {
  it('accepts a well-formed payload', () => {
    expect(parseMirrorsResponse(validResponse)).toEqual(validResponse);
  });

  it('rejects payloads whose top-level shape is wrong', () => {
    expect(parseMirrorsResponse(null)).toBeUndefined();
    expect(parseMirrorsResponse('<html>')).toBeUndefined();
    expect(parseMirrorsResponse({ items: [], sources: [] })).toBeUndefined();
    expect(
      parseMirrorsResponse({ generatedAt: 1, stale: 'no', items: [], sources: [] }),
    ).toBeUndefined();
    expect(
      parseMirrorsResponse({ generatedAt: 1, stale: false, items: {}, sources: [] }),
    ).toBeUndefined();
  });

  it('drops individual records that break the contract instead of failing everything', () => {
    const parsed = parseMirrorsResponse({
      ...validResponse,
      items: [
        ...validResponse.items,
        { mirrorId: 'x', ecosystemId: 'pip', status: 'weird', sourceUrl: 'https://x.example/a' },
        { mirrorId: 'y', ecosystemId: 'pip', status: 'success' },
        'nonsense',
      ],
    });

    expect(parsed?.items).toEqual(validResponse.items);
  });

  it('drops malformed source reports', () => {
    const parsed = parseMirrorsResponse({
      ...validResponse,
      sources: [...validResponse.sources, { url: 'https://x.example/a' }],
    });

    expect(parsed?.sources).toEqual(validResponse.sources);
  });
});

describe('parseFingerprintResponse', () => {
  it('accepts the unavailable shape', () => {
    expect(parseFingerprintResponse({ available: false, computedAt: 5, reason: '未配置' })).toEqual(
      {
        available: false,
        computedAt: 5,
        reason: '未配置',
      },
    );
  });

  it('accepts an available fingerprint', () => {
    expect(
      parseFingerprintResponse({ available: true, fingerprint: 'abc', computedAt: 1 }),
    ).toEqual({
      available: true,
      fingerprint: 'abc',
      computedAt: 1,
    });
  });

  it('rejects payloads without the availability flag', () => {
    expect(parseFingerprintResponse({ fingerprint: 'abc' })).toBeUndefined();
    expect(parseFingerprintResponse(undefined)).toBeUndefined();
  });
});

describe('createStatusClient', () => {
  function jsonFetch(payload: unknown, init: { status?: number } = {}) {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify(payload), {
        status: init.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  it('joins the base url whether or not it ends with a slash', async () => {
    const withSlash = jsonFetch(validResponse);
    await createStatusClient({ baseUrl: '/', fetchImpl: withSlash.fetchImpl }).fetchMirrors();
    expect(withSlash.calls).toEqual(['/api/mirrors']);

    const withoutSlash = jsonFetch(validResponse);
    await createStatusClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: withoutSlash.fetchImpl,
    }).fetchMirrors();
    expect(withoutSlash.calls).toEqual(['http://127.0.0.1:8787/api/mirrors']);
  });

  it('returns undefined and reports the status on an HTTP error', async () => {
    const errors: string[] = [];
    const { fetchImpl } = jsonFetch({}, { status: 503 });

    const result = await createStatusClient({
      baseUrl: '/',
      fetchImpl,
      onError: (message) => errors.push(message),
    }).fetchMirrors();

    expect(result).toBeUndefined();
    expect(errors).toEqual(['HTTP 503']);
  });

  it('returns undefined when the body cannot be parsed', async () => {
    const fetchImpl = (async () =>
      new Response('not json', { status: 200 })) as unknown as typeof fetch;

    await expect(
      createStatusClient({ baseUrl: '/', fetchImpl }).fetchMirrors(),
    ).resolves.toBeUndefined();
  });

  it('aborts after the configured timeout instead of hanging the page', async () => {
    const errors: string[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      })) as unknown as typeof fetch;

    const result = await createStatusClient({
      baseUrl: '/',
      timeoutMs: 10,
      fetchImpl,
      onError: (message) => errors.push(message),
    }).fetchMirrors();

    expect(result).toBeUndefined();
    expect(errors[0]).toContain('超过 10 ms');
  });
});

describe('waitForFingerprint', () => {
  it('resolves as soon as the fingerprint check finishes', async () => {
    let calls = 0;
    const started = Date.now();

    await waitForFingerprint({
      checkFingerprint: async (force?: boolean) => {
        calls += 1;
        expect(force).toBe(true);
        return false;
      },
    });

    expect(calls).toBe(1);
    expect(Date.now() - started).toBeLessThan(FINGERPRINT_WAIT_MS);
  });

  it('gives up after the cap so a slow backend cannot hold up measuring', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Promise<boolean>(() => undefined);
      const waiting = waitForFingerprint({ checkFingerprint: () => pending }, 50);

      vi.advanceTimersByTime(50);
      await expect(waiting).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('swallows a rejecting check instead of breaking the caller', async () => {
    await expect(
      waitForFingerprint({
        checkFingerprint: async () => {
          throw new Error('network down');
        },
      }),
    ).resolves.toBeUndefined();
  });
});
