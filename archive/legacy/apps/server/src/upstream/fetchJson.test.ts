import { describe, expect, it } from 'vitest';

import { fetchJson } from './fetchJson.js';

function jsonResponse(
  payload: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('fetchJson', () => {
  it('returns parsed JSON and the byte count', async () => {
    const outcome = await fetchJson('https://example.com/status.json', {
      fetchImpl: async () => jsonResponse([{ name: 'pypi' }]),
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.payload).toEqual([{ name: 'pypi' }]);
      expect(outcome.bytes).toBeGreaterThan(0);
      expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('reports HTTP failures with the status code', async () => {
    const outcome = await fetchJson('https://example.com/status.json', {
      fetchImpl: async () => new Response('nope', { status: 503 }),
    });

    expect(outcome).toEqual({ ok: false, error: 'HTTP 503' });
  });

  it('reports a non-JSON body instead of throwing', async () => {
    const outcome = await fetchJson('https://example.com/status.json', {
      fetchImpl: async () => new Response('<html>maintenance</html>', { status: 200 }),
    });

    expect(outcome).toEqual({ ok: false, error: '响应不是合法 JSON' });
  });

  it('refuses a response that announces more bytes than the limit', async () => {
    const outcome = await fetchJson('https://example.com/status.json', {
      maxBytes: 10,
      fetchImpl: async () => jsonResponse({ ok: true }, { headers: { 'content-length': '9000' } }),
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error).toContain('超过上限');
  });

  it('aborts a body that grows past the limit even without content-length', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('[{"name":"a"},'));
        controller.enqueue(new TextEncoder().encode('{"name":"b"},'));
        controller.enqueue(new TextEncoder().encode('{"name":"c"}]'));
        controller.close();
      },
    });

    const outcome = await fetchJson('https://example.com/status.json', {
      maxBytes: 12,
      fetchImpl: async () => new Response(body, { status: 200 }),
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error).toContain('超过上限');
  });

  it('turns a timeout into a readable error', async () => {
    const outcome = await fetchJson('https://example.com/status.json', {
      timeoutMs: 20,
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        // 模拟一个永远不返回的上游，直到被 AbortController 打断。
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      }) as unknown as typeof fetch,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error).toContain('超过 20 ms 未完成');
  });

  it('does not leak an exception when the network layer throws', async () => {
    const outcome = await fetchJson('https://example.com/status.json', {
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });

    expect(outcome).toEqual({ ok: false, error: '请求失败' });
  });
});
