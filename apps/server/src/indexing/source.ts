import PQueue from 'p-queue';
import { sourceUrl, SOURCE_CONCURRENCY, SOURCE_CACHE_ENTRIES } from './policy.js';

interface SourcePool {
  limiters: Map<string, PQueue>;
  responses: Map<string, Promise<string>>;
}

export class SourceError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}
/** 后台只读取软件目录元数据；JSON/HTML共用限制配置、按站点限速，不取包体。 */
export class SourceClient {
  requests = 0;
  bytes = 0;
  reusedRequests = 0;
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 30000,
    private readonly maxBytes = 4 * 1024 ** 2,
    private readonly maxDecoded = 8 * 1024 ** 2,
    private readonly pool: SourcePool = { limiters: new Map(), responses: new Map() },
    private readonly cacheScope?: string,
  ) {}
  /** 共享站点并发池和同批次响应，每个任务独立记录实际网络开销。 */
  fork(cacheScope?: string): SourceClient {
    return new SourceClient(
      this.fetchImpl,
      this.timeoutMs,
      this.maxBytes,
      this.maxDecoded,
      this.pool,
      cacheScope,
    );
  }
  async json(value: string): Promise<unknown> {
    const text = await this.read(value, 'json');
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) throw new SourceError('源目录不是有效JSON，未发布', false);
      throw error;
    }
  }
  html(value: string): Promise<string> {
    return this.read(value, 'html');
  }
  private async read(value: string, kind: 'json' | 'html'): Promise<string> {
    const target = sourceUrl(value);
    const url = target.href;
    const cacheKey =
      this.cacheScope === undefined ? undefined : `${this.cacheScope}:${kind}:${url}`;
    const cached = cacheKey === undefined ? undefined : this.pool.responses.get(cacheKey);
    if (cached) {
      this.reusedRequests++;
      return cached;
    }
    let limiter = this.pool.limiters.get(target.origin);
    if (!limiter) {
      limiter = new PQueue({ concurrency: SOURCE_CONCURRENCY });
      this.pool.limiters.set(target.origin, limiter);
    }
    const request = limiter.add(async () => {
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
            accept: kind === 'json' ? 'application/json' : 'text/html,application/xhtml+xml',
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
        if (
          kind === 'html' &&
          !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(
            response.headers.get('content-type') ?? '',
          )
        ) {
          await response.body?.cancel();
          throw new SourceError('源目录不是HTML，未发布', false);
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
            if (bytes > this.maxBytes) throw new SourceError('软件目录体积超过限额，未发布', false);
            text += decoder.decode(part.value, { stream: true });
            if (text.length * 2 > this.maxDecoded)
              throw new SourceError('软件目录解码体积超过限额，未发布', false);
          }
          return text + decoder.decode();
        } finally {
          await reader.cancel().catch(() => {});
        }
      } catch (error) {
        controller.abort();
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }) as Promise<string>;
    if (cacheKey !== undefined) {
      this.pool.responses.set(cacheKey, request);
      while (this.pool.responses.size > SOURCE_CACHE_ENTRIES)
        this.pool.responses.delete(this.pool.responses.keys().next().value!);
    }
    return request.catch((error) => {
      if (cacheKey !== undefined && this.pool.responses.get(cacheKey) === request)
        this.pool.responses.delete(cacheKey);
      throw error;
    });
  }
}
