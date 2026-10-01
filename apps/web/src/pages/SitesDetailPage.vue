<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import { MIRROR_KIND_LABELS } from '../lib/mirrorKind';
import { loadResources, loadSite, type SiteSummary } from '../lib/resourceApi';
import { KIND_LABELS, PLATFORM_LABELS, type ResourceSummary } from '../lib/downloads';
import { runProbe } from '../lib/probe';

const props = defineProps<{ id: string }>();
const site = ref<SiteSummary>();
const entries = ref<ResourceSummary[]>([]);
const loading = ref(true);
const failure = ref('');
let directoryController: AbortController | undefined;

async function refresh(siteId: string): Promise<void> {
  directoryController?.abort();
  const next = new AbortController();
  directoryController = next;
  loading.value = true;
  failure.value = '';
  entries.value = [];
  try {
    const [identity, resources] = await Promise.all([
      loadSite(siteId, next.signal),
      loadResources({ site: siteId }, next.signal),
    ]);
    if (next.signal.aborted) return;
    site.value = identity;
    entries.value = resources;
  } catch (error) {
    if (!next.signal.aborted)
      failure.value = error instanceof Error ? error.message : '目录暂不可用';
  } finally {
    if (!next.signal.aborted) loading.value = false;
  }
}
onMounted(() => void refresh(props.id));
watch(
  () => props.id,
  (id) => void refresh(id),
);
const query = ref('');
const visible = computed(() => {
  const value = query.value.trim().toLocaleLowerCase();
  if (value === '') return entries.value;
  return entries.value.filter((entry) =>
    [entry.name, entry.repoId, entry.ecosystemLabel, entry.versionsHint]
      .join(' ')
      .toLocaleLowerCase()
      .includes(value),
  );
});
const checking = ref(false);
const latency = ref<string>();
let controller: AbortController | undefined;

onUnmounted(() => {
  controller?.abort();
  directoryController?.abort();
});

async function measure(): Promise<void> {
  if (!site.value?.probe || checking.value) return;
  checking.value = true;
  latency.value = undefined;
  const result = await runProbe({ mirrorId: site.value.id, probe: site.value.probe });
  latency.value =
    result.outcome === 'result' &&
    result.result.status === 'ok' &&
    result.result.durationMs !== null
      ? `响应耗时约 ${result.result.durationMs} ms`
      : '请求失败或超时';
  checking.value = false;
}
</script>

<template>
  <div class="shell-inner">
    <p v-if="loading && !site" class="hint">正在读取数据库…</p>
    <p v-else-if="failure && !site" class="hint">{{ failure }}</p>
    <div v-else-if="site" class="page site-detail">
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
          <div v-if="site.id === 'pku'">
            <dt>已收录仓库</dt>
            <dd>{{ site.resourceCount }} 条</dd>
          </div>
          <div>
            <dt>本站收录资源</dt>
            <dd>{{ loading ? '读取中…' : failure ? '暂不可用' : `${entries.length} 条` }}</dd>
          </div>
        </dl>
        <div v-if="site.probe" class="site-probe">
          <button class="btn" type="button" :disabled="checking" @click="measure">
            {{ checking ? '测速中…' : '测一下本站响应' }}</button
          ><span v-if="latency" class="hint">{{ latency }}</span>
        </div>
        <p v-if="loading" class="hint">正在读取站点目录…</p>
        <p v-else-if="failure" role="alert" class="hint">{{ failure }}</p>
        <section v-else-if="entries.length > 0" class="site-section">
          <div class="page-head"><h2>这个站点能下什么</h2></div>
          <div class="search">
            <div class="search-field">
              <input
                v-model="query"
                type="search"
                :placeholder="`在 ${site.name} 的资源里筛选`"
                aria-label="筛选本站资源"
              />
            </div>
          </div>
          <p v-if="!visible.length" class="hint">没有匹配的资源。</p>
          <div v-else class="rows pku-entries">
            <div class="row head">
              <span>官方目录</span><span>类型与平台</span><span>本站下载</span>
            </div>
            <div v-for="entry in visible" :key="entry.id" class="row body">
              <span class="row-name">
                <RouterLink
                  v-if="entry.downloadMode !== 'unavailable'"
                  class="text"
                  :to="{ name: 'resource', params: { id: entry.id } }"
                >
                  {{ entry.ecosystemLabel }} · {{ entry.name }}
                </RouterLink>
                <span v-else class="text">{{ entry.ecosystemLabel }} · {{ entry.name }}</span>
              </span>
              <span class="row-url">
                {{ KIND_LABELS[entry.kind] ?? entry.kind }} ·
                {{ entry.platforms.map((item) => PLATFORM_LABELS[item] ?? item).join(' / ') }}
              </span>
              <span class="row-count">{{
                entry.downloadMode === 'files' ? `${entry.artifactCount} 个文件` : '尚未入库'
              }}</span>
            </div>
          </div>
        </section>
        <section v-else class="site-section">
          <h2>资源采集未启用</h2>
          <p>当前只启用北京大学镜像站的后台索引。</p>
          <a :href="site.homepageUrl" target="_blank" rel="noopener noreferrer">前往官方站点 →</a>
        </section>
      </div>
    </div>
    <div v-else class="page">
      <p>没有找到该镜像站。<RouterLink :to="{ name: 'sites' }">返回目录</RouterLink></p>
    </div>
  </div>
</template>
