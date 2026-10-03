<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import SearchBar from '../components/SearchBar.vue';
import { loadEcosystems, loadResources } from '../lib/resourceApi';
import type { EcosystemSummary, ResourceSummary } from '../lib/downloads';

const searching = ref(false);
const activeEcosystem = ref('');
const options = ref<EcosystemSummary[]>([]);
const resources = ref<ResourceSummary[]>([]);
const loading = ref(true);
const failure = ref('');
const controller = new AbortController();
const visible = computed(() =>
  activeEcosystem.value === ''
    ? resources.value
    : resources.value.filter((resource) => resource.ecosystemId === activeEcosystem.value),
);

onMounted(async () => {
  try {
    [resources.value, options.value] = await Promise.all([
      loadResources({}, controller.signal),
      loadEcosystems(controller.signal),
    ]);
  } catch (error) {
    if (!controller.signal.aborted)
      failure.value = error instanceof Error ? error.message : '资源目录暂不可用';
  } finally {
    loading.value = false;
  }
});
onUnmounted(() => controller.abort());

function filesLabel(resource: ResourceSummary): string {
  return resource.downloadMode === 'files' ? `${resource.artifactCount} 个文件` : '尚未入库';
}
</script>

<template>
  <div class="shell-inner">
    <div class="page home" :data-searching="searching">
      <div class="page-main">
        <SearchBar @update:active="searching = $event" />
        <div class="page-head"><h1>下载与安装教程</h1></div>

        <div class="eco-filter" role="group" aria-label="按生态筛选">
          <button
            type="button"
            class="eco-chip"
            :aria-pressed="activeEcosystem === ''"
            @click="activeEcosystem = ''"
          >
            全部 {{ resources.length }}
          </button>
          <button
            v-for="option in options"
            :key="option.id"
            type="button"
            class="eco-chip"
            :aria-pressed="activeEcosystem === option.id"
            @click="activeEcosystem = option.id"
          >
            {{ option.label }}
            <span class="eco-chip-count">{{ option.resourceCount }}</span>
          </button>
        </div>

        <p v-if="loading" class="hint">正在读取资源目录…</p>
        <p v-else-if="failure" role="alert" class="hint">{{ failure }}</p>
        <p v-else-if="activeEcosystem && visible.length === 0" class="hint">
          该生态已收录，安装资源尚未接入。
        </p>
        <div v-else class="rows dir home-ecos">
          <div class="row head"><span>资源</span><span class="row-count">文件</span></div>
          <RouterLink
            v-for="resource in visible"
            :key="resource.id"
            class="row body"
            :to="{ name: 'resource', params: { id: resource.id } }"
          >
            <span class="row-name">
              <span class="text">{{ resource.ecosystemLabel }} · {{ resource.name }}</span>
              <span class="hint">{{
                resource.tutorialId === null ? resource.siteName : `${resource.siteName} · 带教程`
              }}</span>
            </span>
            <span class="row-count">{{ filesLabel(resource) }}</span>
          </RouterLink>
        </div>
      </div>

      <div class="page-meta">
        <div class="meta-block">
          <h2>资源</h2>
          <dl class="kv">
            <div>
              <dt>收录站点</dt>
              <dd class="num">北大试点</dd>
            </div>
            <div>
              <dt>已收录软件</dt>
              <dd class="num">{{ resources.length }}</dd>
            </div>
            <div>
              <dt>生态</dt>
              <dd class="num">{{ options.length }}</dd>
            </div>
          </dl>
        </div>
        <div class="meta-block">
          <h2>怎么用</h2>
          <p>先选生态或搜索软件，再选文件；文件由镜像站直接提供。现有教程在下载区下方。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eco-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: var(--space-4);
}
.eco-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: var(--size-sm);
  cursor: pointer;
}
.eco-chip[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent);
}
.eco-chip-count {
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
</style>
