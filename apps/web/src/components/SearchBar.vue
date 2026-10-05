<script setup lang="ts">
import { Search, X } from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { searchCatalog, type CatalogItem } from '../lib/resourceApi';
import { usePagedList } from '../composables/usePagedList';
import PageEnd from './PageEnd.vue';
import { isEditableElement, moveIndex, resolveSearchKey, shouldFocusSearch } from '../lib/keys';
type SearchHit = CatalogItem;

const router = useRouter();

const query = ref('');
const activeIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);
const composing = ref(false);

const hasQuery = computed(() => query.value.trim().length > 0);

const showResults = computed(() => hasQuery.value);

const {
  items: hits,
  loading: searching,
  error: failure,
  nextCursor,
  reset,
  load,
} = usePagedList<SearchHit>((cursor, signal) => searchCatalog(query.value.trim(), cursor, signal));
let timer: ReturnType<typeof setTimeout> | undefined;
watch(query, (value) => {
  if (timer) clearTimeout(timer);
  reset();
  if (!value.trim()) return;
  searching.value = true;
  timer = setTimeout(() => void load(), 180);
});
const activeHit = computed(() => hits.value[activeIndex.value]);

function openResource(hit: SearchHit): void {
  void router.push({
    name: hit.type === 'software' ? 'software' : 'ecosystem',
    params: { id: hit.id },
  });
  activeIndex.value = -1;
}

function activate(hit: SearchHit | undefined): void {
  if (hit) {
    openResource(hit);
  }
}

function onKeydown(event: KeyboardEvent): void {
  const action = resolveSearchKey({
    key: event.key,
    isComposing: event.isComposing || composing.value,
    resultCount: hits.value.length,
  });

  if (action === 'ignore') {
    return;
  }

  if (action === 'close') {
    event.preventDefault();
    if (query.value.length > 0) {
      query.value = '';
      activeIndex.value = -1;
    } else {
      inputRef.value?.blur();
    }
    return;
  }

  event.preventDefault();

  if (action === 'next') {
    activeIndex.value = moveIndex(activeIndex.value, 1, hits.value.length);
  } else if (action === 'previous') {
    activeIndex.value = moveIndex(activeIndex.value, -1, hits.value.length);
  } else if (action === 'open') {
    activate(hits.value[activeIndex.value] ?? hits.value[0]);
  }
}

function onGlobalKeydown(event: KeyboardEvent): void {
  const editable = isEditableElement(document.activeElement as HTMLElement | null);
  if (
    shouldFocusSearch({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      isEditable: editable,
      isComposing: event.isComposing,
    })
  ) {
    event.preventDefault();
    inputRef.value?.focus();
    inputRef.value?.select();
  }
}

function clearQuery(): void {
  query.value = '';
  activeIndex.value = -1;
  inputRef.value?.focus();
}

watch(query, () => {
  activeIndex.value = -1;
});

watch(hits, (value) => {
  if (activeIndex.value >= value.length) {
    activeIndex.value = -1;
  }
});

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  if (timer) clearTimeout(timer);
  window.removeEventListener('keydown', onGlobalKeydown);
});

defineExpose({ focus: () => inputRef.value?.focus() });
</script>

<template>
  <div class="search">
    <div class="search-field">
      <Search :size="16" class="search-icon" aria-hidden="true" />
      <input
        ref="inputRef"
        v-model="query"
        type="search"
        maxlength="200"
        role="combobox"
        aria-label="搜索生态或软件"
        aria-autocomplete="list"
        aria-controls="search-results"
        :aria-expanded="showResults"
        :aria-activedescendant="
          activeHit ? `search-hit-${activeHit.type}-${activeHit.id}` : undefined
        "
        placeholder="搜索生态或软件（如 Python、Debian、Node.js）"
        autocomplete="off"
        @keydown="onKeydown"
        @compositionstart="composing = true"
        @compositionend="composing = false"
      />
      <button
        v-if="hasQuery"
        class="search-clear"
        type="button"
        aria-label="清空搜索"
        @click="clearQuery"
      >
        <X :size="15" aria-hidden="true" />
      </button>
      <kbd v-else class="search-hint" aria-hidden="true">/</kbd>
    </div>

    <div
      v-if="showResults"
      id="search-results"
      class="search-results"
      role="listbox"
      aria-label="搜索结果"
      @mousedown.prevent
    >
      <p v-if="searching && hits.length === 0" class="search-empty">搜索中…</p>
      <p v-else-if="hits.length === 0 && !failure" class="search-empty">
        没有准确匹配的生态或软件。
      </p>

      <div
        v-for="hit in hits"
        :id="`search-hit-${hit.type}-${hit.id}`"
        :key="`${hit.type}:${hit.id}`"
        class="search-hit"
        role="option"
        :aria-selected="hits[activeIndex] === hit"
        tabindex="-1"
        @mouseenter="activeIndex = hits.indexOf(hit)"
        @click="activate(hit)"
      >
        <span class="hit-title">{{ hit.name }}</span>
        <span class="hit-subtitle">{{
          hit.type === 'ecosystem' ? `${hit.softwareCount} 款软件` : hit.ecosystemLabel
        }}</span>
        <span class="hit-kind">{{ hit.type === 'ecosystem' ? '生态' : '软件' }}</span>
      </div>
    </div>

    <PageEnd
      v-if="showResults && (nextCursor || failure || (searching && hits.length > 0))"
      :has-more="!!nextCursor"
      :loading="searching && hits.length > 0"
      :error="failure"
      @load="load(!!nextCursor)"
    />

    <p v-if="showResults && hits.length > 0" class="search-keys">
      <kbd>↑</kbd> <kbd>↓</kbd> 选择 <kbd>↵</kbd> 打开 <kbd>Esc</kbd> 清空
    </p>
  </div>
</template>
