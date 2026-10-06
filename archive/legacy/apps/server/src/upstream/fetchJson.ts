import { SYNC_FETCH_TIMEOUT_MS, SYNC_MAX_RESPONSE_BYTES } from '@mirrorn/shared/sync';

/**
 * 抓取上游 JSON 的受限请求。
 *
 * 上游是别人维护的静态文件，必须假设它会慢、会变成超大响应、会返回 HTML 错误页：
 *   - 超时用 `AbortController` 熔断；
 *   - 先看 `Content-Length`，再在读取时累计字节数，超过上限立刻中止（不能指望响应体不下载）；
 *   - 正文只在完整读完且是合法 JSON 时才算成功。
 */
export interface FetchJsonOptions {
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

export type FetchJsonOutcome =
  { ok: true; payload: unknown; durationMs: number; bytes: number } | { ok: false; error: string };

export async function fetchJson(
  url: string,
  options: FetchJsonOptions = {},
): Promise<FetchJsonOutcome> {
  const timeoutMs = options.timeoutMs ?? SYNC_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? SYNC_MAX_RESPONSE_BYTES;
  const fetchImpl = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const declaredLength = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return { ok: false, error: `响应体 ${declaredLength} 字节，超过上限 ${maxBytes}` };
    }

    const text = await readCappedText(response, maxBytes);
    if (!text.ok) {
      return { ok: false, error: text.error };
    }

    try {
      const payload: unknown = JSON.parse(text.text);
      return {
        ok: true,
        payload,
        durationMs: Date.now() - started,
        bytes: text.bytes,
      };
    } catch {
      return { ok: false, error: '响应不是合法 JSON' };
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ok: false, error: aborted ? `请求超过 ${timeoutMs} ms 未完成` : '请求失败' };
  } finally {
    clearTimeout(timer);
  }
}

async function readCappedText(
  response: Response,
  maxBytes: number,
): Promise<{ ok: true; text: string; bytes: number } | { ok: false; error: string }> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    return bytes > maxBytes
      ? { ok: false, error: `响应体 ${bytes} 字节，超过上限 ${maxBytes}` }
      : { ok: true, text, bytes };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: `响应体超过上限 ${maxBytes} 字节` };
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, text: new TextDecoder('utf-8').decode(merged), bytes };
}
