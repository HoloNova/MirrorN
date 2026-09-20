<script setup lang="ts">
import { CornerDownLeft, Search, X } from '@lucide/vue';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import type { Ecosystem } from '@mirrorn/shared';

import { toProbeTargets } from '../composables/useMirrorProbes';
import { getCatalog } from '../lib/ecosystems';
import { isEditableElement, moveIndex, resolveSearchKey, shouldFocusSearch } from '../lib/keys';
import { createProbeCache, selectCachedResults } from '../lib/probeCache';
import { createSearchIndex, MAX_RESULTS, type MirrorHit, type SearchHit } from '../lib/search';

const emit = defineEmits<{ 'update:active': [boolean] }>();

const router = useRouter();
const catalog = getCatalog();
const index = createSearchIndex(catalog);

/**
 * 搜索只展示缓存里的测量值，不发起新的探测：每次键入都全量扫描会浪费带宽，
 * 也会让结果列表在输入过程中不停变化。真正发起测量的是首页的测量入口与生态页。
 */
const probeCache = createProbeCache();
const probeTargets = toProbeTargets(catalog.mirrors);

const query = ref('');
const activeIndex = ref(-1);
const expandedMirrorId = ref<string | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const composing = ref(false);

const hits = computed<SearchHit[]>(() => index.search(query.value));
const hasQuery = computed(() => query.value.trim().length > 0);
const showResults = computed(() => hasQuery.value);
const activeHit = computed(() => hits.value[activeIndex.value]);

const ecosystemById = computed(() => new Map(catalog.ecosystems.map((item) => [item.id, item])));

const cachedProbes = computed(() => {
  const mirrorIds = new Set(
    hits.value.filter((hit) => hit.kind === 'mirror').map((hit) => hit.mirrorId),
  );
  const selected = selectCachedResults(probeCache.read(), probeTargets, Date.now());

  for (const mirrorId of [...selected.keys()]) {
    if (!mirrorIds.has(mirrorId)) {
      selected.delete(mirrorId);
    }
  }

  return selected;
});

/** 过期的测量值不参与展示：搜索卡片太窄，说不清"可能已过期"只会造成误导。 */
function cachedLatency(mirrorId: string): string | undefined {
  const cached = cachedProbes.value.get(mirrorId);
  if (
    !cached ||
    cached.stale ||
    cached.result.status !== 'ok' ||
    cached.result.durationMs === null
  ) {
    return undefined;
  }
  return `≈ ${cached.result.durationMs} ms`;
}

function ecosystemLabel(id: string): string {
  return ecosystemById.value.get(id)?.name ?? id;
}

function ecosystemsFor(hit: MirrorHit): Ecosystem[] {
  return hit.ecosystemIds
    .map((id) => ecosystemById.value.get(id))
    .filter((item): item is Ecosystem => item !== undefined);
}

function openEcosystem(ecosystemId: string): void {
  void router.push({ name: 'ecosystem', params: { id: ecosystemId } });
  activeIndex.value = -1;
}

function activate(hit: SearchHit | undefined): void {
  if (!hit) {
    return;
  }

  if (hit.kind === 'ecosystem') {
    openEcosystem(hit.ecosystemId);
    return;
  }

  // 镜像不是一个独立页面：展开它在本地数据中真正支持的生态，由用户选择下一步。
  expandedMirrorId.value = expandedMirrorId.value === hit.mirrorId ? null : hit.mirrorId;
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
      expandedMirrorId.value = null;
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
  expandedMirrorId.value = null;
  inputRef.value?.focus();
}

watch(query, () => {
  activeIndex.value = -1;
  expandedMirrorId.value = null;
});

watch(hits, (value) => {
  if (activeIndex.value >= value.length) {
    activeIndex.value = -1;
  }
});

watch(showResults, async (value) => {
  emit('update:active', value);
  if (value) {
    await nextTick();
  }
});

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
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
        aria-label="搜索生态、发行版或软件包"
        aria-autocomplete="list"
        aria-controls="search-results"
        :aria-expanded="showResults"
        :aria-activedescendant="activeHit ? `search-hit-${activeHit.id}` : undefined"
        placeholder="搜索生态、发行版或软件包..."
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
    >
      <p v-if="hits.length === 0" class="search-empty">
        没有匹配的生态或来源。可以换一个关键词，或直接在下方目录里浏览。
      </p>

      <template v-else>
        <div
          v-for="(hit, position) in hits"
          :id="`search-hit-${hit.id}`"
          :key="hit.id"
          class="search-hit"
          role="option"
          :aria-selected="position === activeIndex"
          tabindex="-1"
          @mouseenter="activeIndex = position"
          @click="activate(hit)"
        >
          <span class="hit-row">
            <span class="hit-title">{{ hit.title }}</span>
            <span v-if="hit.kind === 'mirror' && cachedLatency(hit.mirrorId)" class="hit-latency">
              {{ cachedLatency(hit.mirrorId) }}
            </span>
            <span v-if="hit.matchedTerms.length > 0" class="hit-terms">
              {{ hit.matchedTerms.join(' / ') }}
            </span>
            <span class="hit-subtitle">{{ hit.subtitle }}</span>
          </span>

          <span v-if="hit.kind === 'mirror' && expandedMirrorId === hit.mirrorId" class="hit-chips">
            <span class="hit-chips-label">选择要配置的生态：</span>
            <button
              v-for="ecosystem in ecosystemsFor(hit)"
              :key="ecosystem.id"
              type="button"
              class="chip"
              @click.stop="openEcosystem(ecosystem.id)"
            >
              {{ ecosystem.name }}
            </button>
          </span>
          <span v-else-if="hit.kind === 'mirror'" class="search-footnote">
            {{ ecosystemLabel(hit.ecosystemIds[0]) }} 等
            {{ hit.ecosystemIds.length }} 个生态，回车展开
          </span>
        </div>
      </template>
    </div>

    <p v-if="showResults && hits.length > 0" class="search-footnote">
      <CornerDownLeft :size="12" aria-hidden="true" />
      <span
        >回车选择，上下键移动，Esc 退出。最多显示
        {{ MAX_RESULTS }}
        条结果，搜索完全在本地进行；毫秒数来自此前测量过的结果，不代表下载速度。</span
      >
    </p>
  </div>
</template>
