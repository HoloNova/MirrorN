<script setup lang="ts">
import { Search, X } from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { loadResources } from '../lib/resourceApi';
import type { ResourceSummary } from '../lib/downloads';
import { isEditableElement, moveIndex, resolveSearchKey, shouldFocusSearch } from '../lib/keys';
type SearchHit = ResourceSummary;

const emit = defineEmits<{ 'update:active': [boolean] }>();

const router = useRouter();

const query = ref('');
const focused = ref(false);
const activeIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);
const composing = ref(false);

const hasQuery = computed(() => query.value.trim().length > 0);

/**
 * 搜索态：点一下输入框就进入（首页据此把框拉到视觉中心、收起其它内容），
 * 不是等用户敲了字才进入——否则第一下点击“什么都没发生”。
 */
const active = computed(() => focused.value || hasQuery.value);
const showResults = computed(() => hasQuery.value);

const hits = ref<SearchHit[]>([]);
const searching = ref(false);
const failure = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | undefined;
let generation = 0;

watch(query, (value) => {
  generation += 1;
  const current = generation;
  if (timer) clearTimeout(timer);
  controller?.abort();
  hits.value = [];
  failure.value = '';
  searching.value = value.trim() !== '';
  if (!searching.value) return;
  timer = setTimeout(() => {
    controller = new AbortController();
    void loadResources({ query: value.trim(), downloadableOnly: true }, controller.signal)
      .then((items) => {
        if (generation === current) hits.value = items.slice(0, 8);
      })
      .catch((error: unknown) => {
        if (generation === current)
          failure.value = error instanceof Error ? error.message : '搜索暂不可用';
      })
      .finally(() => {
        if (generation === current) searching.value = false;
      });
  }, 180);
});
const activeHit = computed(() => hits.value[activeIndex.value]);

function openResource(hit: SearchHit): void {
  void router.push({ name: 'resource', params: { id: hit.id } });
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

/**
 * 失焦退出搜索态。
 *
 * 用 mousedown 在结果面板上 preventDefault（见模板）而不是延迟 blur：后者会让点击结果
 * 与退出搜索态抢同一个事件，出现“点了没反应”。
 */
function onBlur(): void {
  focused.value = false;
}

watch(query, () => {
  activeIndex.value = -1;
});

watch(hits, (value) => {
  if (activeIndex.value >= value.length) {
    activeIndex.value = -1;
  }
});

watch(active, (value) => emit('update:active', value), { immediate: true });

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  if (timer) clearTimeout(timer);
  controller?.abort();
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
        role="combobox"
        aria-label="搜索生态或软件"
        aria-autocomplete="list"
        aria-controls="search-results"
        :aria-expanded="showResults"
        :aria-activedescendant="activeHit ? `search-hit-${activeHit.id}` : undefined"
        placeholder="搜索生态或软件（如 Python、Debian、Node.js）"
        autocomplete="off"
        @keydown="onKeydown"
        @focus="focused = true"
        @blur="onBlur"
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
      <p v-if="searching" class="search-empty">搜索中…</p>
      <p v-else-if="failure" class="search-empty" role="alert">{{ failure }}</p>
      <p v-else-if="hits.length === 0" class="search-empty">没有匹配的下载资源。</p>

      <span v-if="hits.length > 0" class="search-group">资源</span>

      <div
        v-for="hit in hits"
        :id="`search-hit-${hit.id}`"
        :key="hit.id"
        class="search-hit"
        role="option"
        :aria-selected="hits[activeIndex]?.id === hit.id"
        tabindex="-1"
        @mouseenter="activeIndex = hits.findIndex((item) => item.id === hit.id)"
        @click="activate(hit)"
      >
        <span class="hit-title">{{ hit.ecosystemLabel }} · {{ hit.name }}</span>
        <span class="hit-subtitle">{{ hit.siteName }}</span>
        <span class="hit-kind">{{ hit.downloadMode === 'files' ? '文件直链' : '尚未入库' }}</span>
      </div>
    </div>

    <p v-if="showResults && hits.length > 0" class="search-keys">
      <kbd>↑</kbd> <kbd>↓</kbd> 选择 <kbd>↵</kbd> 打开 <kbd>Esc</kbd> 清空
    </p>
  </div>
</template>
