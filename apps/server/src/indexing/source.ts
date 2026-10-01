import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createZstdDecompress } from 'node:zlib';
import PQueue from 'p-queue';
import Xz from 'xz-decompress';
const { XzReadableStream } = Xz;
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
export class SourceClient {
  private readonly limiter = new PQueue({ concurrency: 1, intervalCap: 1, interval: 1000 });
  requests = 0;
  bytes = 0;
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 30000,
    private readonly maxBytes = 128 * 1024 * 1024,
    private readonly maxDecoded = 512 * 1024 * 1024,
  ) {}

  /** 回调消费完整流；只对连接/网络读等待超时，不把Redis入队或解析耗时当网络失败。重试只由BullMQ管理。 */
  async consume<T>(
    value: string,
    parse: (stream: ReadableStream<Uint8Array>) => Promise<T>,
    expected?: { size?: number; sha256?: string },
    compression?: 'gzip' | 'xz' | 'zstd',
  ): Promise<{ value: T; digest: string }> {
    const url = sourceUrl(value).href;
    return (await this.limiter.add(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      this.requests++;
      try {
        const response = await this.fetchImpl(url, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'user-agent': 'MirrorN metadata indexer; https://mirror.campuslink.vip',
            accept: 'application/json, text/html, */*',
          },
        });
        if (!response.ok) {
          await response.body?.cancel();
          const retry = response.status === 429 || response.status >= 500;
          const raw = response.headers.get('retry-after');
          const delay = raw
            ? /^\d+$/.test(raw)
              ? Number(raw) * 1000
              : Math.max(0, Date.parse(raw) - Date.now())
            : 0;
          throw new SourceError(
            `源索引 HTTP ${response.status}: ${url}`,
            retry,
            Number.isFinite(delay) ? delay : 0,
          );
        }
        if (!response.body) throw new SourceError('源索引正文为空', true);
        clearTimeout(timer);
        const bodyReader = response.body.getReader();
        const body = new ReadableStream<Uint8Array>({
          pull: async (output) => {
            let readTimer: ReturnType<typeof setTimeout> | undefined;
            try {
              const part = await Promise.race([
                bodyReader.read(),
                new Promise<never>((_resolve, reject) => {
                  readTimer = setTimeout(
                    () => reject(new SourceError('读取源索引超时', true)),
                    this.timeoutMs,
                  );
                }),
              ]);
              if (part.done) output.close();
              else output.enqueue(part.value);
            } catch (error) {
              controller.abort();
              await bodyReader.cancel(error).catch(() => {});
              throw error;
            } finally {
              if (readTimer) clearTimeout(readTimer);
            }
          },
          cancel: (reason) => bodyReader.cancel(reason),
        });
        const hash = createHash('sha256');
        let bytes = 0;
        let decoded = 0;
        let stream: ReadableStream<Uint8Array> = body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform: (chunk, out) => {
              bytes += chunk.byteLength;
              this.bytes += chunk.byteLength;
              if (bytes > this.maxBytes)
                throw new SourceError('索引网络体积超过限额，未发布', false);
              hash.update(chunk);
              out.enqueue(chunk);
            },
          }),
        );
        if (compression === 'gzip' || url.endsWith('.gz'))
          stream = stream.pipeThrough(
            new DecompressionStream('gzip') as unknown as ReadableWritablePair<
              Uint8Array,
              Uint8Array
            >,
          );
        else if (compression === 'xz' || url.endsWith('.xz')) stream = new XzReadableStream(stream);
        else if (compression === 'zstd' || /\.(?:zst|zstd)$/.test(url)) {
          const input = Readable.from(chunks(stream));
          const decoder = createZstdDecompress();
          input.on('error', (error) => decoder.destroy(error));
          decoder.on('error', (error) => input.destroy(error));
          decoder.on('close', () => input.destroy());
          stream = Readable.toWeb(input.pipe(decoder)) as ReadableStream<Uint8Array>;
        }
        stream = stream.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform: (chunk, out) => {
              decoded += chunk.byteLength;
              if (decoded > this.maxDecoded)
                throw new SourceError('解压索引超过限额，未发布', false);
              out.enqueue(chunk);
            },
          }),
        );
        const result = await parse(stream);
        const digest = hash.digest('hex');
        if (expected?.size !== undefined && bytes !== expected.size)
          throw new SourceError('索引长度与声明不符', true);
        if (expected?.sha256 && digest !== expected.sha256.toLowerCase())
          throw new SourceError('索引SHA256与声明不符', true);
        return { value: result, digest };
      } catch (error) {
        controller.abort();
        if (error instanceof SourceError) throw error;
        if (error instanceof SyntaxError)
          throw new SourceError(`源索引结构无效: ${String(error)}`, false);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }))!;
  }
  async text(url: string): Promise<string> {
    return (
      await this.consume(url, async (stream) => {
        let text = '';
        const decoder = new TextDecoder();
        for await (const chunk of chunks(stream)) text += decoder.decode(chunk, { stream: true });
        return text + decoder.decode();
      })
    ).value;
  }
  async json(url: string): Promise<unknown> {
    return JSON.parse(await this.text(url)) as unknown;
  }
}

export async function* chunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function* textChunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  for await (const chunk of chunks(stream)) yield decoder.decode(chunk, { stream: true });
  const tail = decoder.decode();
  if (tail) yield tail;
}
