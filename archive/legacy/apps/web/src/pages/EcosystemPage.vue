<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { loadEcosystemPage, type CatalogItem } from '../lib/resourceApi';
import { KIND_LABELS } from '../lib/downloads';
import { usePagedList } from '../composables/usePagedList';
import PageEnd from '../components/PageEnd.vue';
const props = defineProps<{ id: string }>();
const title = ref('');
const query = ref('');
const { items, nextCursor, total, loading, error, reset, load } = usePagedList<CatalogItem>(
  async (cursor, signal) => {
    const page = await loadEcosystemPage(props.id, query.value.trim(), cursor, signal);
    if (!signal.aborted) title.value = page.ecosystem.name;
    return page;
  },
);
let timer: ReturnType<typeof setTimeout> | undefined;
function refresh() {
  if (timer) clearTimeout(timer);
  reset();
  title.value = '';
  query.value = '';
  void load();
}
onMounted(refresh);
watch(() => props.id, refresh);
watch(query, () => {
  if (timer) clearTimeout(timer);
  reset();
  loading.value = true;
  timer = setTimeout(() => void load(), 180);
});
onUnmounted(() => {
  if (timer) clearTimeout(timer);
});
</script>
<template>
  <div class="shell-inner">
    <div class="page is-single">
      <div class="page-main">
        <RouterLink class="crumbs" :to="{ name: 'home' }">← 返回搜索</RouterLink>
        <div class="page-head">
          <h1>{{ title || '生态' }}</h1>
          <span class="stamp">{{ total }} 款软件</span>
        </div>
        <div v-if="title" class="search">
          <div class="search-field">
            <input
              v-model="query"
              type="search"
              maxlength="200"
              placeholder="搜索这个生态下的软件"
              aria-label="搜索生态下的软件"
            />
          </div>
        </div>
        <div v-if="items.length" class="rows ecosystem-software">
          <div class="row head"><span>软件</span><span>类型</span></div>
          <RouterLink
            v-for="item in items"
            :key="item.id"
            class="row body"
            :to="{ name: 'software', params: { id: item.id } }"
            ><span class="row-name"
              ><span class="text">{{ item.name }}</span></span
            ><span class="entry-kind">{{ KIND_LABELS[item.kind] ?? item.kind }}</span></RouterLink
          >
        </div>
        <p v-if="!loading && !error && !items.length" class="hint">没有匹配的软件。</p>
        <PageEnd
          :has-more="!!nextCursor"
          :loading="loading"
          :error="error"
          @load="load(!!nextCursor)"
        />
      </div>
    </div>
  </div>
</template>
<style scoped>
.search {
  margin: var(--space-4) 0;
}
.ecosystem-software {
  max-width: none;
}
.ecosystem-software .row {
  grid-template-columns: minmax(0, 1fr) 100px;
}
.entry-kind {
  color: var(--ink-3);
  font-size: var(--size-small);
}
@media (max-width: 767px) {
  .ecosystem-software .row {
    padding: var(--space-3) 0;
    grid-template-columns: minmax(0, 1fr) 80px;
  }
}
</style>
