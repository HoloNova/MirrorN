import { searchLimits } from '../../content/search/limits.ts';
import type { SearchEngine } from '../../content/search/engine.ts';

async function readIndexText(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`搜索索引 HTTP ${response.status}`);
  if (Number(response.headers.get('Content-Length')) > searchLimits.indexBytes) throw new Error('搜索索引超过体积预算');
  if (!response.body) throw new Error('搜索索引没有响应正文');
  const reader = response.body.getReader();
  let chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > searchLimits.indexBytes) {
        await reader.cancel();
        throw new Error('搜索索引超过体积预算');
      }
      chunks = [...chunks, value];
    }
    return await new Blob(chunks).text();
  } finally { reader.releaseLock(); }
}

/** 同源摘要路径、限时/限量读取；失败后由用户触发重试，不后台循环请求。 */
export async function loadSearchEngine(path: string, revalidate = false, signal?: AbortSignal): Promise<SearchEngine> {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !/^\/search-index\/[a-f0-9]{64}\.json$/.test(url.pathname) || url.search || url.hash) {
    throw new Error('搜索索引地址不符合静态摘要路径');
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  signal?.addEventListener('abort', abort, { once: true });
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => { controller.abort(); reject(new Error('搜索加载超时')); }, searchLimits.loadTimeoutMs);
  });
  try {
    const [module, text] = await Promise.race([Promise.all([
      import('../../content/search/engine.ts'),
      fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'error', cache: revalidate ? 'no-cache' : 'default' }).then(readIndexText),
    ]), timeout]);
    // HTTPS/localhost 下核对实际摘要；非安全上下文仍使用版本路径和 Schema，不冒充已校验摘要。
    if (window.crypto?.subtle) {
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      if (url.pathname !== `/search-index/${hash}.json`) throw new Error('搜索索引与页面版本不一致');
    }
    return module.createSearchEngine(JSON.parse(text) as unknown);
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}
