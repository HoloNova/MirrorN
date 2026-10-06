<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { CuratedSummary } from '@mirrorn/shared';
import { curatedList } from '../lib/curationApi';
const query = ref('');
const items = ref<CuratedSummary[]>([]);
const loading = ref(false);
const error = ref('');
let request: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  loading.value = true;
  error.value = '';
  items.value = [];
  try {
    const result = await curatedList(query.value.trim(), controller.signal);
    if (!controller.signal.aborted) items.value = result;
  } catch (cause) {
    if (!controller.signal.aborted)
      error.value = cause instanceof Error ? cause.message : '读取失败';
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
}
watch(query, () => {
  if (timer) clearTimeout(timer);
  request?.abort();
  timer = setTimeout(() => void load(), 180);
});
onMounted(() => void load());
onUnmounted(() => {
  request?.abort();
  if (timer) clearTimeout(timer);
});
</script>
<template>
  <div class="shell-inner content-page">
    <h1>已收录生态</h1>
    <p class="hint">逐个整理，审核后发布。这里不是镜像站的全量目录。</p>
    <div class="search">
      <div class="search-field">
        <input
          v-model="query"
          type="search"
          maxlength="200"
          aria-label="搜索已收录生态"
          placeholder="搜索已收录生态"
        />
      </div>
    </div>
    <p v-if="error" class="content-error" role="alert">
      {{ error }} <button @click="load">重试</button>
    </p>
    <p v-if="loading" class="hint">加载中…</p>
    <p v-else-if="!error && !items.length" class="hint">
      {{
        query ? '没有匹配的已收录生态。' : '还没有发布的生态。维护者可到内容管理中整理第一个生态。'
      }}
    </p>
    <div class="content-ecosystem-list">
      <RouterLink
        v-for="item in items"
        :key="item.id"
        :to="{ name: 'ecosystem', params: { id: item.id } }"
        ><h2>{{ item.name }}</h2>
        <p>{{ item.summary }}</p>
        <small class="hint">{{ item.versionCount }} 个已整理版本</small></RouterLink
      >
    </div>
  </div>
</template>
