<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
const props = defineProps<{ hasMore: boolean; loading: boolean; error?: string }>();
const emit = defineEmits<{ load: [] }>();
const marker = ref<HTMLElement>();
let observer: IntersectionObserver | undefined;
function load() {
  if (!props.loading) emit('load');
}
async function observe() {
  await nextTick();
  if (!marker.value || !observer) return;
  observer.unobserve(marker.value);
  if (props.hasMore && !props.loading && !props.error) observer.observe(marker.value);
}
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver(
    (entries) => {
      if (
        entries.some((entry) => entry.isIntersecting) &&
        props.hasMore &&
        !props.loading &&
        !props.error
      )
        load();
    },
    { rootMargin: '100px' },
  );
  void observe();
});
watch(
  () => [props.hasMore, props.loading, props.error],
  () => void observe(),
);
onUnmounted(() => observer?.disconnect());
</script>
<template>
  <div ref="marker" class="page-end" aria-live="polite">
    <p v-if="error" class="hint" role="alert">{{ error }}</p>
    <p v-if="loading" class="hint">正在加载…</p>
    <button v-else-if="hasMore || error" class="btn" type="button" @click="load">
      {{ error ? '重试' : '加载更多' }}
    </button>
  </div>
</template>
<style scoped>
.page-end {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  padding: var(--space-4) 0;
}
.page-end p {
  margin: 0;
}
</style>
