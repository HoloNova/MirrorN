import { describe, expect, it, vi } from 'vitest';

import { PROBE_LIMITS, type ProbeResult, type ProbeTarget } from '@mirrorn/shared/probe';

import { probeSignature, runProbe } from './probe';

const target: ProbeTarget = {
  mirrorId: 'example-mirror',
  probe: {
    id: 'example-robots',
    url: 'https://example.com/robots.txt',
    mode: 'no-cors',
    method: 'get',
    cacheBust: false,
  },
};

const corsTarget: ProbeTarget = {
  mirrorId: 'example-mirror',
  probe: { ...target.probe, id: 'example-ping', url: 'https://example.com/-/ping', mode: 'cors' },
};

function opaqueResponse(): Response {
  return { type: 'opaque', status: 0, ok: false, body: null } as unknown as Response;
}

function readableResponse(
  status: number,
  cancel: () => Promise<void> = () => Promise.resolve(),
): Response {
  return {
    type: 'cors',
    status,
    ok: status >= 200 && status < 300,
    body: { cancel },
  } as unknown as Response;
}

/** 永远不返回响应，只在请求被取消时失败：用来复现超时和调用方取消。 */
function pendingUntilAborted(init: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
}

interface FetchRecord {
  url: string;
  init: RequestInit;
}

function createRecorder(response: Response | ((init: RequestInit) => Promise<Response>)) {
  const calls: FetchRecord[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestInit = init ?? {};
    calls.push({ url: String(input), init: requestInit });
    return typeof response === 'function' ? await response(requestInit) : response;
  }) as typeof fetch;

  return { calls, fetchImpl };
}

async function runForResult(
  probeTarget: ProbeTarget,
  signal?: AbortSignal,
  overrides: Parameters<typeof runProbe>[2] = {},
): Promise<ProbeResult> {
  const attempt = await runProbe(probeTarget, signal, overrides);
  if (attempt.outcome !== 'result') {
    throw new Error('探针被取消，测试需要的是结果');
  }
  return attempt.result;
}

describe('probeSignature', () => {
  it('changes with the audited probe target, not with the mirror name', () => {
    const renamed: ProbeTarget = { ...target, mirrorId: 'renamed-mirror' };
    const changedMode: ProbeTarget = { ...target, probe: { ...target.probe, mode: 'cors' } };

    expect(probeSignature(renamed)).toBe(probeSignature(target));
    expect(probeSignature(changedMode)).not.toBe(probeSignature(target));
  });
});

describe('runProbe', () => {
  it('reports an opaque no-cors response as completed but unverified', async () => {
    const { calls, fetchImpl } = createRecorder(opaqueResponse());
    const clock = [100, 137];
    const result = await runForResult(target, undefined, {
      fetchImpl,
      monotonicNow: () => clock.shift() ?? 137,
      epochNow: () => 1_758_000_000_000,
    });

    expect(result.status).toBe('ok');
    expect(result.durationMs).toBe(37);
    expect(result.opaque).toBe(true);
    expect(result.httpStatus).toBeUndefined();
    expect(result.measuredAt).toBe(1_758_000_000_000);
    expect(result.mode).toBe('no-cors');
    expect(calls[0]?.init).toMatchObject({
      mode: 'no-cors',
      method: 'get',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  });

  it('reads the status code in cors mode and cancels the body instead of downloading it', async () => {
    const cancel = vi.fn(() => Promise.resolve());
    const { calls, fetchImpl } = createRecorder(readableResponse(200, cancel));
    const result = await runForResult(corsTarget, undefined, {
      fetchImpl,
      monotonicNow: () => 0,
      epochNow: () => 1,
    });

    expect(result.status).toBe('ok');
    expect(result.opaque).toBe(false);
    expect(result.httpStatus).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(calls[0]?.url).toBe('https://example.com/-/ping');
  });

  it('keeps a successful measurement even when the body cannot be cancelled', async () => {
    // 极少数实现里 body 或 cancel 不标准；这不该把一次成功的响应判成失败。
    const oddBodies = [
      { type: 'cors', status: 200, ok: true, body: null } as unknown as Response,
      { type: 'cors', status: 200, ok: true, body: {} } as unknown as Response,
      {
        type: 'cors',
        status: 200,
        ok: true,
        body: {
          cancel: () => {
            throw new Error('cancel 不可用');
          },
        },
      } as unknown as Response,
    ];

    for (const response of oddBodies) {
      const { fetchImpl } = createRecorder(response);
      const result = await runForResult(corsTarget, undefined, {
        fetchImpl,
        monotonicNow: () => 0,
        epochNow: () => 1,
      });
      expect(result.status).toBe('ok');
      expect(result.httpStatus).toBe(200);
    }
  });

  it('treats a readable non-2xx response as a failed probe, not as a fast source', async () => {
    const { fetchImpl } = createRecorder(readableResponse(404));
    const result = await runForResult(corsTarget, undefined, {
      fetchImpl,
      monotonicNow: () => 0,
      epochNow: () => 1,
    });

    expect(result.status).toBe('failed');
    expect(result.durationMs).toBeNull();
    expect(result.httpStatus).toBe(404);
  });

  it('reports a timeout when the request outlives the threshold', async () => {
    vi.useFakeTimers();
    try {
      const { fetchImpl } = createRecorder(pendingUntilAborted);
      const pending = runForResult(target, undefined, { fetchImpl, epochNow: () => 5 });
      await vi.advanceTimersByTimeAsync(PROBE_LIMITS.timeoutMs);

      const result = await pending;
      expect(result.status).toBe('timeout');
      expect(result.durationMs).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a browser fetch failure as failed without claiming the site is down', async () => {
    const { fetchImpl } = createRecorder(() => Promise.reject(new TypeError('Failed to fetch')));
    const result = await runForResult(target, undefined, {
      fetchImpl,
      epochNow: () => 7,
    });

    expect(result.status).toBe('failed');
    expect(result.opaque).toBe(false);
  });

  it('returns no result when the caller cancels the round', async () => {
    const controller = new AbortController();
    const { fetchImpl } = createRecorder(pendingUntilAborted);
    const pending = runProbe(target, controller.signal, { fetchImpl });
    controller.abort();

    expect(await pending).toEqual({ outcome: 'cancelled' });
  });

  it('only appends a cache-busting parameter for probes that were verified with one', async () => {
    const withBust = createRecorder(opaqueResponse());
    await runProbe({ ...target, probe: { ...target.probe, cacheBust: true } }, undefined, {
      fetchImpl: withBust.fetchImpl,
      epochNow: () => 1_758_000_123_456,
      monotonicNow: () => 0,
    });

    const withoutBust = createRecorder(opaqueResponse());
    await runProbe(target, undefined, {
      fetchImpl: withoutBust.fetchImpl,
      epochNow: () => 1_758_000_123_456,
      monotonicNow: () => 0,
    });

    expect(withBust.calls[0]?.url).toBe('https://example.com/robots.txt?v=1758000123456');
    expect(withoutBust.calls[0]?.url).toBe('https://example.com/robots.txt');
  });
});
