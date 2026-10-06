<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';

import { MIRROR_KIND_LABELS } from '../lib/mirrorKind';
import { loadSites, type SiteSummary } from '../lib/resourceApi';
const mirrors = ref<SiteSummary[]>([]);
const failure = ref('');
const loading = ref(true);
const request = new AbortController();
onMounted(async () => {
  try {
    mirrors.value = await loadSites(request.signal);
  } catch (error) {
    if (!request.signal.aborted) failure.value = String(error);
  } finally {
    loading.value = false;
  }
});
onUnmounted(() => request.abort());

const query = ref('');
function domainOf(url: string): string {
  return new URL(url).host;
}
const rows = computed(() =>
  mirrors.value.filter((site) =>
    [site.name, site.id, site.homepageUrl, ...site.aliases]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.value.trim().toLocaleLowerCase()),
  ),
);
</script>

<template>
  <div class="shell-inner">
    <div class="page">
      <div class="page-main">
        <div class="search">
          <div class="search-field">
            <input v-model="query" type="search" placeholder="筛选镜像站" aria-label="筛选镜像站" />
          </div>
        </div>
        <div class="page-head">
          <h1>镜像站</h1>
          <span class="stamp num">{{ rows.length }} / {{ mirrors.length }} 站</span>
        </div>
        <p v-if="loading" class="hint">正在读取数据库…</p>
        <p v-else-if="failure" class="hint">{{ failure }}</p>
        <p v-else-if="!rows.length" class="hint">没有匹配的站点。</p>
        <div v-else class="rows dir">
          <div class="row head">
            <span>站点</span><span>性质</span><span>官方地址</span
            ><span class="row-count">目录</span>
          </div>
          <RouterLink
            v-for="site in rows"
            :key="site.id"
            class="row body"
            :to="{ name: 'site', params: { id: site.id } }"
          >
            <span class="row-name"
              ><span class="text">{{ site.name }}</span></span
            >
            <span class="kind">{{ MIRROR_KIND_LABELS[site.kind] }}</span>
            <span class="row-url">{{ domainOf(site.homepageUrl) }}</span>
            <span class="row-count">{{
              site.enabled ? `${site.resourceCount} 条` : '未启用'
            }}</span>
          </RouterLink>
        </div>
      </div>
      <div class="page-meta">
        <div class="meta-block">
          <h2>目录进度</h2>
          <p>北大站已核对官方目录；其他站点暂提供官方入口，逐站整理中。</p>
        </div>
      </div>
    </div>
  </div>
</template>
