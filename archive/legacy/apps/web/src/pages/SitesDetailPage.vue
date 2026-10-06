<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { MIRROR_KIND_LABELS } from '../lib/mirrorKind';
import { loadSitePage, loadSite, type SiteSummary, type SiteEntry } from '../lib/resourceApi';
import { KIND_LABELS } from '../lib/downloads';
import { runProbe } from '../lib/probe';
import { usePagedList } from '../composables/usePagedList';
import PageEnd from '../components/PageEnd.vue';
const props = defineProps<{ id: string }>();
const site = ref<SiteSummary>();
const identityLoading = ref(true);
const identityError = ref('');
const query = ref('');
const {
  items: entries,
  nextCursor,
  total,
  started,
  loading,
  error,
  reset,
  load,
} = usePagedList<SiteEntry>((cursor, signal) =>
  loadSitePage(props.id, query.value.trim(), cursor, signal),
);
let identityController: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
async function refresh(id: string) {
  identityController?.abort();
  const request = new AbortController();
  identityController = request;
  if (timer) clearTimeout(timer);
  reset();
  query.value = '';
  site.value = undefined;
  identityLoading.value = true;
  identityError.value = '';
  latency.value = '';
  try {
    const value = await loadSite(id, request.signal);
    if (!request.signal.aborted) site.value = value;
  } catch (failure) {
    if (!request.signal.aborted)
      identityError.value = failure instanceof Error ? failure.message : '站点读取失败';
  } finally {
    if (!request.signal.aborted) identityLoading.value = false;
  }
}
watch(query, () => {
  if (timer) clearTimeout(timer);
  const shouldLoad = started.value;
  reset();
  if (shouldLoad) {
    started.value = true;
    loading.value = true;
    timer = setTimeout(() => void load(), 180);
  }
});
const checking = ref(false);
const latency = ref('');
async function measure() {
  const current = site.value;
  if (!current?.probe || checking.value) return;
  checking.value = true;
  const result = await runProbe({ mirrorId: current.id, probe: current.probe });
  if (site.value?.id === current.id)
    latency.value =
      result.outcome === 'result' &&
      result.result.status === 'ok' &&
      result.result.durationMs !== null
        ? `响应耗时约 ${result.result.durationMs} ms`
        : '请求失败或超时';
  checking.value = false;
}
onMounted(() => void refresh(props.id));
watch(
  () => props.id,
  (id) => void refresh(id),
);
onUnmounted(() => {
  identityController?.abort();
  if (timer) clearTimeout(timer);
});
</script>
<template>
  <div class="shell-inner">
    <p v-if="identityLoading" class="hint">正在读取站点…</p>
    <p v-else-if="identityError" class="hint" role="alert">{{ identityError }}</p>
    <div v-else-if="site" class="page is-single site-detail">
      <div class="page-main">
        <RouterLink class="crumbs" :to="{ name: 'sites' }">← 返回站点目录</RouterLink>
        <div class="page-head site-head">
          <h1>{{ site.name }}</h1>
          <span class="kind">{{ MIRROR_KIND_LABELS[site.kind] }}</span>
        </div>
        <dl class="kv wide">
          <div>
            <dt>官方地址</dt>
            <dd>
              <a :href="site.homepageUrl" target="_blank" rel="noopener noreferrer">{{
                site.homepageUrl
              }}</a>
            </dd>
          </div>
          <div>
            <dt>可下载软件</dt>
            <dd>{{ site.resourceCount }} 条</dd>
          </div>
        </dl>
        <div v-if="site.probe" class="site-probe">
          <button class="btn" type="button" :disabled="checking" @click="measure">
            {{ checking ? '测速中…' : '测一下本站响应' }}
          </button>
          <span v-if="latency" class="hint">{{ latency }}</span>
        </div>
        <section v-if="site.enabled" class="site-section">
          <div class="page-head">
            <h2>这个站点能下什么</h2>
            <span v-if="started" class="stamp">{{ entries.length }} / {{ total }} 条</span>
          </div>
          <button v-if="!started" class="btn" type="button" @click="load()">加载资源</button>
          <template v-else>
            <div class="search">
              <div class="search-field">
                <input
                  v-model="query"
                  type="search"
                  maxlength="200"
                  :placeholder="`搜索 ${site.name} 的生态或软件`"
                  aria-label="搜索本站资源"
                />
              </div>
            </div>
            <p v-if="!entries.length && !loading && !error" class="hint">没有匹配的可下载软件。</p>
            <div v-if="entries.length" class="rows site-resources">
              <div class="row head">
                <span>软件</span><span>生态</span><span>类型</span
                ><span class="row-count">文件</span>
              </div>
              <RouterLink
                v-for="entry in entries"
                :key="entry.id"
                class="row body"
                :to="{ name: 'resource', params: { id: entry.id } }"
              >
                <span class="row-name"
                  ><span class="text">{{ entry.name }}</span></span
                >
                <span class="entry-ecosystem">{{ entry.ecosystemLabel }}</span>
                <span class="entry-kind">{{ KIND_LABELS[entry.kind] ?? entry.kind }}</span>
                <span class="row-count">{{ entry.artifactCount }}</span>
              </RouterLink>
            </div>
            <PageEnd
              :has-more="!!nextCursor"
              :loading="loading"
              :error="error"
              @load="load(!!nextCursor)"
            />
          </template>
        </section>
        <section v-else class="site-section">
          <h2>资源采集未启用</h2>
          <a :href="site.homepageUrl" target="_blank" rel="noopener noreferrer">前往官方站点</a>
        </section>
      </div>
    </div>
  </div>
</template>
<style scoped>
.site-resources {
  max-width: none;
}
.site-resources .row {
  grid-template-columns: minmax(0, 1fr) 180px 96px 64px;
}
.entry-ecosystem,
.entry-kind {
  color: var(--ink-3);
  font-size: var(--size-small);
  overflow-wrap: anywhere;
}
.row-count {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.site-section .search {
  margin: var(--space-4) 0;
}
@media (max-width: 767px) {
  .site-resources .row {
    grid-template-columns: minmax(0, 1fr) 80px 48px;
    padding: var(--space-3) 0;
  }
  .entry-ecosystem {
    grid-column: 1;
    grid-row: 2;
  }
  .entry-kind {
    grid-column: 2;
    grid-row: 1;
  }
  .row-count {
    grid-column: 3;
    grid-row: 1;
  }
}
</style>
