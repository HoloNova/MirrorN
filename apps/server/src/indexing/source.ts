import PQueue from 'p-queue';
import { sourceUrl } from './policy.js';

export class SourceError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}
/** 软件目录JSON只在后台读取，限速/限额；不取包体、不落盘保留原始索引。 */
export class SourceClient {
  private readonly limiter = new PQueue({ concurrency: 1, intervalCap: 1, interval: 1000 });
  requests = 0;
  bytes = 0;
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 30000,
    private readonly maxBytes = 4 * 1024 ** 2,
    private readonly maxDecoded = 8 * 1024 ** 2,
  ) {}
  async json(value: string): Promise<unknown> {
    const url = sourceUrl(value).href;
    return this.limiter.add(async () => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const resetTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(), this.timeoutMs);
      };
      this.requests++;
      resetTimer();
      try {
        const response = await this.fetchImpl(url, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'user-agent': 'MirrorN software installer indexer; https://mirror.campuslink.vip',
            accept: 'application/json',
          },
        });
        if (!response.ok) {
          await response.body?.cancel();
          const raw = response.headers.get('retry-after');
          const delay = raw
            ? /^\d+$/.test(raw)
              ? Number(raw) * 1000
              : Math.max(0, Date.parse(raw) - Date.now())
            : 0;
          throw new SourceError(
            `源目录 HTTP ${response.status}: ${url}`,
            response.status === 429 || response.status >= 500,
            Number.isFinite(delay) ? delay : 0,
          );
        }
        if (!response.body) throw new SourceError('源目录正文为空', true);
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let text = '',
          bytes = 0;
        try {
          while (true) {
            resetTimer();
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            this.bytes += part.value.byteLength;
            if (bytes > Math.min(this.maxBytes, this.maxDecoded))
              throw new SourceError('软件目录体积超过限额，未发布', false);
            text += decoder.decode(part.value, { stream: true });
          }
          return JSON.parse(text + decoder.decode()) as unknown;
        } finally {
          await reader.cancel().catch(() => {});
        }
      } catch (error) {
        controller.abort();
        if (error instanceof SourceError) throw error;
        if (error instanceof SyntaxError)
          throw new SourceError('源目录不是有效JSON，未发布', false);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    });
  }
}
