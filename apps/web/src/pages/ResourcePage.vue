<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  detectPlatform,
  humanSize,
  KIND_LABELS,
  PLATFORM_LABELS,
  type Artifact,
} from '../lib/downloads';
import {
  loadFiles,
  loadDownloadStart,
  loadSoftware,
  loadVersions,
  loadNetworkFingerprint,
  ResourceApiError,
  type SoftwareDetail,
  type DownloadStart,
  type FileFilters,
} from '../lib/resourceApi';
import {
  rememberSite,
  saveTraffic,
  setSaveTraffic,
  selectDownloadCandidate,
  syncDownloadPreference,
} from '../lib/downloadPreference';
import { usePagedList } from '../composables/usePagedList';
import PageEnd from '../components/PageEnd.vue';
const props = defineProps<{ id: string; legacy?: boolean }>();
const detected =
  typeof navigator === 'undefined' ? {} : detectPlatform(navigator.userAgent, navigator.platform);
const software = ref<SoftwareDetail>();
const loading = ref(true);
const failure = ref('');
const selected = ref('');
const started = ref(false);
const platform = ref('');
const arch = ref('');
const version = ref('');
const fileQuery = ref('');
const options = ref<DownloadStart['options']>({
  platforms: [],
  arches: [],
  roles: [],
  versionCount: 0,
});
const files = ref<Artifact[]>([]);
const nextCursor = ref<string | null>(null);
const fileLoading = ref(false);
const fileError = ref('');
const versionsOpen = ref(false);
const versionQuery = ref('');
const candidates = computed(
  () =>
    software.value?.candidates.filter(
      (candidate) => !saveTraffic.value || candidate.region === 'CN',
    ) ?? [],
);
const candidate = computed(() => candidates.value.find((item) => item.id === selected.value));
const platforms = computed(() =>
  options.value.platforms.filter((item) => item !== 'any' && item !== 'unknown'),
);
const arches = computed(() =>
  options.value.arches.filter((item) => item !== 'unknown' && item !== 'any'),
);
let identityController: AbortController | undefined;
let fileController: AbortController | undefined;
let fingerprint: string | undefined;
let manuallySelected = false;
let versionTimer: ReturnType<typeof setTimeout> | undefined;
const filters = (): FileFilters => ({
  platform: platform.value,
  arch: arch.value,
  version: version.value === '*' ? '' : version.value,
  q: fileQuery.value.trim(),
});
const {
  items: history,
  nextCursor: historyCursor,
  loading: historyLoading,
  error: historyError,
  reset: resetHistory,
  load: loadHistory,
} = usePagedList<string>((cursor, signal) => {
  if (!candidate.value) throw new Error('没有可用下载站点');
  return loadVersions(candidate.value, filters(), versionQuery.value.trim(), cursor, signal);
});
function cancelDownloads() {
  fileController?.abort();
  fileController = undefined;
  fileLoading.value = false;
  fileError.value = '';
  files.value = [];
  nextCursor.value = null;
  started.value = false;
  options.value = { platforms: [], arches: [], roles: [], versionCount: 0 };
  versionsOpen.value = false;
  if (versionTimer) clearTimeout(versionTimer);
  resetHistory();
}
async function refresh() {
  identityController?.abort();
  const request = new AbortController();
  identityController = request;
  cancelDownloads();
  software.value = undefined;
  selected.value = '';
  loading.value = true;
  failure.value = '';
  fileQuery.value = '';
  fingerprint = undefined;
  manuallySelected = false;
  try {
    const value = await loadSoftware(props.id, props.legacy, request.signal);
    if (request.signal.aborted) return;
    software.value = value;
    selected.value = selectDownloadCandidate(
      value.candidates,
      value.id,
      props.legacy ? props.id.split(':')[0] : undefined,
    );
    loading.value = false;
    // 单来源没有比较需求，不发指纹或测速请求。多来源也不让指纹校验阻塞基本信息。
    if (value.candidates.length > 1) {
      try {
        fingerprint = await loadNetworkFingerprint(request.signal);
      } catch {
        fingerprint = undefined;
      }
      if (!request.signal.aborted && !started.value && !manuallySelected)
        selected.value = selectDownloadCandidate(
          value.candidates,
          value.id,
          props.legacy ? props.id.split(':')[0] : undefined,
          fingerprint,
        );
    }
  } catch (error) {
    if (!request.signal.aborted)
      failure.value = error instanceof Error ? error.message : '软件读取失败';
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
async function update(append = false): Promise<void> {
  const source = candidate.value;
  if (!source || (append && (fileLoading.value || !nextCursor.value))) return;
  fileController?.abort();
  const request = new AbortController();
  fileController = request;
  fileLoading.value = true;
  fileError.value = '';
  if (!append) {
    files.value = [];
    nextCursor.value = null;
    started.value = false;
    if (versionTimer) clearTimeout(versionTimer);
    resetHistory();
    versionsOpen.value = false;
  }
  try {
    if (append) {
      const page = await loadFiles(
        source.id,
        source.downloadEntry,
        { ...filters(), cursor: nextCursor.value! },
        request.signal,
      );
      if (request.signal.aborted || fileController !== request) return;
      files.value = [...files.value, ...page.items];
      nextCursor.value = page.nextCursor;
    } else {
      const allVersions = version.value === '*';
      const page = await loadDownloadStart(
        source,
        { ...filters(), ...(allVersions ? { version: '*' } : {}) },
        request.signal,
      );
      if (request.signal.aborted || fileController !== request) return;
      platform.value = page.filters.platform;
      arch.value = page.filters.arch;
      version.value = allVersions ? '*' : page.filters.version;
      options.value = page.options;
      files.value = page.items;
      nextCursor.value = page.nextCursor;
      started.value = true;
    }
  } catch (error) {
    if (request.signal.aborted || fileController !== request) return;
    if (append && error instanceof ResourceApiError && error.status === 409) {
      await update();
    } else fileError.value = error instanceof Error ? error.message : '文件读取失败，请重试';
  } finally {
    if (fileController === request) fileLoading.value = false;
  }
}
function changeFilter() {
  version.value = '';
  void update();
}
function openVersions() {
  versionsOpen.value = !versionsOpen.value;
  if (versionTimer) clearTimeout(versionTimer);
  resetHistory();
  if (versionsOpen.value) {
    if (versionQuery.value) versionQuery.value = '';
    else void loadHistory();
  }
}
function chooseVersion(value: string) {
  version.value = value;
  void update();
}
function chooseSite() {
  manuallySelected = true;
  if (candidate.value && software.value) rememberSite(software.value.id, candidate.value.siteId);
}
watch(selected, () => {
  cancelDownloads();
  platform.value = detected.os ?? '';
  arch.value = detected.arch ?? '';
  version.value = '';
  void update();
});
watch(saveTraffic, () => {
  if (candidate.value || !software.value) return;
  selected.value = selectDownloadCandidate(
    software.value.candidates,
    software.value.id,
    undefined,
    fingerprint,
  );
});
watch(versionQuery, () => {
  if (versionTimer) clearTimeout(versionTimer);
  resetHistory();
  if (versionsOpen.value) {
    historyLoading.value = true;
    versionTimer = setTimeout(() => void loadHistory(), 180);
  }
});
onMounted(() => {
  void refresh();
  window.addEventListener('storage', syncDownloadPreference);
});
watch(
  () => [props.id, props.legacy],
  () => void refresh(),
);
onUnmounted(() => {
  identityController?.abort();
  fileController?.abort();
  if (versionTimer) clearTimeout(versionTimer);
  window.removeEventListener('storage', syncDownloadPreference);
});
</script>
<template>
  <div class="shell-inner">
    <div class="page is-single resource-page">
      <div class="page-main">
        <p v-if="loading" class="hint">正在读取软件…</p>
        <p v-else-if="failure" class="hint" role="alert">{{ failure }}</p>
        <template v-else-if="software">
          <RouterLink
            class="crumbs"
            :to="{ name: 'ecosystem', params: { id: software.ecosystemId } }"
            >{{ software.ecosystemLabel }}</RouterLink
          >
          <h1>{{ software.name }}</h1>
          <div class="download-card">
            <div class="download-heading">
              <span class="download-title">{{ KIND_LABELS[software.kind] ?? '下载' }}</span>
              <label class="traffic-toggle"
                ><input
                  type="checkbox"
                  :checked="saveTraffic"
                  @change="setSaveTraffic(($event.target as HTMLInputElement).checked)"
                />节省代理流量</label
              >
            </div>
            <p v-if="saveTraffic" class="hint traffic-hint">
              只显示已核实的中国大陆下载入口。全局代理下，仍需将下载域名设为直连。
            </p>
            <p v-if="!candidate" class="hint">
              {{
                saveTraffic
                  ? '没有符合节省流量条件的下载站点；未回退到海外来源。'
                  : '暂无可用下载站点。'
              }}
            </p>
            <template v-else>
              <div class="source-choice">
                <label for="download-site">下载站点</label>
                <select id="download-site" v-model="selected" @change="chooseSite">
                  <option v-for="source in candidates" :key="source.id" :value="source.id">
                    {{ source.siteName }}
                  </option>
                </select>
              </div>
              <section class="download-content" aria-label="下载文件">
                <div v-if="started" class="download-fields">
                  <label v-if="platforms.length"
                    >系统<select v-model="platform" @change="changeFilter">
                      <option value="">全部</option>
                      <option v-for="item in platforms" :key="item" :value="item">
                        {{ PLATFORM_LABELS[item] ?? item }}
                      </option>
                    </select></label
                  >
                  <label v-if="arches.length"
                    >架构<select v-model="arch" @change="changeFilter">
                      <option value="">全部</option>
                      <option v-for="item in arches" :key="item" :value="item">{{ item }}</option>
                    </select></label
                  >
                  <div class="version-field">
                    <span>镜像站版本</span
                    ><button
                      class="btn version-button"
                      type="button"
                      :aria-expanded="versionsOpen"
                      @click="openVersions"
                    >
                      {{ version === '*' ? '全部版本' : version || '未标注' }} · 更换
                    </button>
                  </div>
                </div>
                <div v-if="versionsOpen" class="version-picker">
                  <div class="search">
                    <div class="search-field">
                      <input
                        v-model="versionQuery"
                        type="search"
                        maxlength="200"
                        placeholder="搜索历史版本"
                        aria-label="搜索历史版本"
                      />
                    </div>
                  </div>
                  <button class="btn" type="button" @click="chooseVersion('*')">全部版本</button>
                  <ul class="version-list">
                    <li v-for="item in history" :key="item">
                      <button
                        type="button"
                        :aria-pressed="version === item"
                        @click="chooseVersion(item)"
                      >
                        {{ item }}
                      </button>
                    </li>
                  </ul>
                  <p v-if="!history.length && !historyLoading && !historyError" class="hint">
                    没有匹配的版本。
                  </p>
                  <PageEnd
                    :has-more="!!historyCursor"
                    :loading="historyLoading"
                    :error="historyError"
                    @load="loadHistory(!!historyCursor)"
                  />
                </div>
                <form v-if="started" class="file-search" @submit.prevent="changeFilter">
                  <label for="file-search">文件名</label
                  ><input
                    id="file-search"
                    v-model="fileQuery"
                    type="search"
                    maxlength="200"
                    placeholder="搜索已入库文件"
                  /><button class="btn" type="submit">查询</button>
                </form>
                <ul class="download-list">
                  <li v-for="file in files" :key="file.url" class="download-row">
                    <span class="download-file"
                      ><strong>{{ file.filename }}</strong>
                      <span v-if="file.role === 'network_installer'" class="hint">联网安装器</span>
                      <span v-if="file.compatibility?.runtime === 'Java'" class="hint"
                        >需要 Java{{
                          file.compatibility?.minimumRuntimeUnverified ? '；最低版本待核对' : ''
                        }}</span
                      >
                    </span>
                    <span class="download-arch">{{
                      file.arch === 'unknown' ? '未标注' : file.arch
                    }}</span>
                    <span class="download-size">{{ humanSize(file.size) || '大小未知' }}</span>
                    <a
                      class="btn btn-primary"
                      :href="file.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      >下载</a
                    >
                  </li>
                </ul>
                <p v-if="started && !files.length && !fileLoading && !fileError" class="hint">
                  此组合没有文件，请调整系统、架构或版本。
                </p>
                <PageEnd
                  :has-more="!!nextCursor"
                  :loading="fileLoading"
                  :error="fileError"
                  @load="update(!!nextCursor)"
                />
              </section>
            </template>
          </div>
          <section class="tutorial-section"><p class="hint">教程待补充。</p></section>
        </template>
      </div>
    </div>
  </div>
</template>
<style scoped>
.resource-page {
  max-width: 960px;
  margin-inline: auto;
}
h1 {
  margin-top: var(--space-4);
}
.download-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
}
.download-title {
  font-weight: 600;
}
.traffic-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--size-small);
  cursor: pointer;
}
.traffic-toggle input {
  flex: none;
}
.traffic-hint {
  margin: var(--space-3) 0;
}
.source-choice {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-4) 0;
  font-size: var(--size-small);
}
.source-choice select {
  width: 100%;
  min-width: 0;
  padding: var(--space-2);
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  font: inherit;
}
.download-content {
  border-top: 1px solid var(--line);
  padding-top: var(--space-4);
}
.download-list,
.version-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.download-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px 88px 64px;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--line);
}
.download-file {
  display: grid;
  min-width: 0;
}
.download-file strong {
  overflow-wrap: anywhere;
  font-weight: 500;
}
.download-arch,
.download-size {
  font-size: var(--size-small);
  color: var(--ink-3);
}
.download-size {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.download-row .btn {
  text-align: center;
}
.version-field {
  display: grid;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--ink-2);
}
.version-button {
  justify-content: space-between;
  min-width: 0;
  overflow-wrap: anywhere;
}
.version-picker {
  border: 1px solid var(--line);
  padding: var(--space-3);
  display: grid;
  gap: var(--space-3);
}
.version-list button {
  width: 100%;
  padding: var(--space-2);
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}
.version-list button:hover,
.version-list button[aria-pressed='true'] {
  background: var(--surface-hover);
}
.file-search {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 64px;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-4) 0;
  font-size: var(--size-small);
}
.file-search input {
  width: 100%;
  min-width: 0;
  padding: var(--space-2);
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
@media (max-width: 700px) {
  .download-heading {
    grid-template-columns: minmax(0, 1fr);
  }
  .traffic-toggle {
    justify-self: end;
  }
  .download-row {
    grid-template-columns: minmax(0, 1fr) 72px 64px;
    gap: var(--space-2);
  }
  .download-file {
    grid-column: 1 / -1;
  }
  .download-arch {
    grid-column: 1;
  }
  .download-size {
    grid-column: 2;
  }
  .download-row .btn {
    grid-column: 3;
  }
  .source-choice {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
