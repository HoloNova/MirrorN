<script setup lang="ts">
import { Search, X } from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import type { Ecosystem } from '@mirrorn/shared';

import { toProbeTargets } from '../composables/useMirrorProbes';
import { getCatalog } from '../lib/ecosystems';
import { isEditableElement, moveIndex, resolveSearchKey, shouldFocusSearch } from '../lib/keys';
import { createProbeCache, selectCachedResults } from '../lib/probeCache';
import { createSearchIndex, type MirrorHit, type SearchHit } from '../lib/search';

const emit = defineEmits<{ 'update:active': [boolean] }>();

const router = useRouter();
const catalog = getCatalog();
const index = createSearchIndex(catalog);

/**
 * 搜索只展示缓存里的测量值，不发起新的探测：每次键入都全量扫描会浪费带宽，
 * 也会让结果列表在输入过程中不停变化。真正发起测速的是首页的测速入口与生态页。
 */
const probeCache = createProbeCache();
const probeTargets = toProbeTargets(catalog.mirrors);

const query = ref('');
const focused = ref(false);
const activeIndex = ref(-1);
const expandedMirrorId = ref<string | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const composing = ref(false);

const hasQuery = computed(() => query.value.trim().length > 0);

/**
 * 搜索态：点一下输入框就进入（首页据此把框拉到视觉中心、收起测速区），
 * 不是等用户敲了字才进入——否则第一下点击“什么都没发生”。
 */
const active = computed(() => focused.value || hasQuery.value);
const showResults = computed(() => hasQuery.value);

/**
 * 结果按类型分段：生态在前、镜像站在后。
 * `kind` 相同的保持索引给出的相关度顺序，只做分组不做重排。
 */
const grouped = computed<Array<{ kind: SearchHit['kind']; label: string; hits: SearchHit[] }>>(
  () => {
    const ecosystems = index.search(query.value).filter((hit) => hit.kind === 'ecosystem');
    const mirrors = index.search(query.value).filter((hit) => hit.kind === 'mirror');
    const groups: Array<{ kind: SearchHit['kind']; label: string; hits: SearchHit[] }> = [];
    if (ecosystems.length > 0) {
      groups.push({ kind: 'ecosystem', label: '生态', hits: ecosystems });
    }
    if (mirrors.length > 0) {
      groups.push({ kind: 'mirror', label: '镜像站', hits: mirrors });
    }
    return groups;
  },
);

/** 键盘导航按“拍平后的顺序”走，与界面上下顺序一致。 */
const hits = computed<SearchHit[]>(() => grouped.value.flatMap((group) => group.hits));
const activeHit = computed(() => hits.value[activeIndex.value]);

const ecosystemById = computed(() => new Map(catalog.ecosystems.map((item) => [item.id, item])));

const cachedProbes = computed(() => {
  const mirrorIds = new Set(
    hits.value.filter((hit) => hit.kind === 'mirror').map((hit) => hit.mirrorId),
  );
  // 搜索结果只借用缓存里的数字，因此不参与“要不要重测”的决定（decisions 丢掉）。
  // 也不传网络指纹：这里只显示一个 ≈ 值，判断网络是否变化是页面（首页 / 生态页）的事。
  const { results: selected } = selectCachedResults(probeCache.read(), probeTargets, Date.now());

  for (const mirrorId of [...selected.keys()]) {
    if (!mirrorIds.has(mirrorId)) {
      selected.delete(mirrorId);
    }
  }

  return selected;
});

/** 过期的测量值不参与展示：结果行太窄，说不清“可能已过期”只会造成误导。 */
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
  expandedMirrorId.value = null;
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
        aria-label="搜索生态、镜像站或系统"
        aria-autocomplete="list"
        aria-controls="search-results"
        :aria-expanded="showResults"
        :aria-activedescendant="activeHit ? `search-hit-${activeHit.id}` : undefined"
        placeholder="搜索生态、镜像站或系统"
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
      <p v-if="hits.length === 0" class="search-empty">没有匹配项。换个关键词试试。</p>

      <template v-for="group in grouped" :key="group.kind">
        <span class="search-group">{{ group.label }}</span>

        <template v-for="hit in group.hits" :key="hit.id">
          <div
            :id="`search-hit-${hit.id}`"
            class="search-hit"
            role="option"
            :aria-selected="hits[activeIndex]?.id === hit.id"
            tabindex="-1"
            @mouseenter="activeIndex = hits.findIndex((item) => item.id === hit.id)"
            @click="activate(hit)"
          >
            <span class="hit-title">{{ hit.title }}</span>
            <span v-if="hit.kind === 'mirror' && cachedLatency(hit.mirrorId)" class="hit-latency">
              {{ cachedLatency(hit.mirrorId) }}
            </span>
            <span class="hit-subtitle">{{ hit.subtitle }}</span>
            <span class="hit-kind">{{ group.label }}</span>
          </div>

          <div v-if="hit.kind === 'mirror' && expandedMirrorId === hit.mirrorId" class="hit-chips">
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
          </div>
        </template>
      </template>
    </div>

    <p v-if="showResults && hits.length > 0" class="search-keys">
      <kbd>↑</kbd> <kbd>↓</kbd> 选择 <kbd>↵</kbd> 打开 <kbd>Esc</kbd> 清空
    </p>
  </div>
</template>
