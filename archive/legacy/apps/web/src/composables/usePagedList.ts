import { onUnmounted, ref, shallowRef } from 'vue';
import { ResourceApiError, type Page } from '../lib/resourceApi';

/** 目录共用取消、续页和跨修订重查；错误不会抹掉已加载的页面，也不会自动重试循环。 */
export function usePagedList<T>(
  read: (cursor: string | undefined, signal: AbortSignal) => Promise<Page<T>>,
) {
  const items = shallowRef<T[]>([]);
  const nextCursor = ref<string | null>(null);
  const total = ref(0);
  const started = ref(false);
  const loading = ref(false);
  const error = ref('');
  let controller: AbortController | undefined;
  function reset() {
    controller?.abort();
    controller = undefined;
    items.value = [];
    nextCursor.value = null;
    total.value = 0;
    started.value = false;
    loading.value = false;
    error.value = '';
  }
  async function load(append = false): Promise<void> {
    if (append && (loading.value || !nextCursor.value)) return;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    started.value = true;
    loading.value = true;
    error.value = '';
    try {
      const page = await read(append ? (nextCursor.value ?? undefined) : undefined, request.signal);
      if (request.signal.aborted || controller !== request) return;
      items.value = append ? [...items.value, ...page.items] : page.items;
      nextCursor.value = page.nextCursor;
      total.value = page.total;
    } catch (failure) {
      if (request.signal.aborted || controller !== request) return;
      if (append && failure instanceof ResourceApiError && failure.status === 409) {
        reset();
        await load();
      } else error.value = failure instanceof Error ? failure.message : '加载失败，请重试';
    } finally {
      if (controller === request) loading.value = false;
    }
  }
  onUnmounted(reset);
  return { items, nextCursor, total, started, loading, error, reset, load };
}
