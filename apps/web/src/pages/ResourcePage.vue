<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  detectPlatform,
  humanSize,
  KIND_LABELS,
  PLATFORM_LABELS,
  type Artifact,
  type ResourceDetail,
} from '../lib/downloads';
import {
  loadFiles,
  loadFileOptions,
  loadResource,
  type FileOptions,
  type FileFilters,
} from '../lib/resourceApi';
const props = defineProps<{ id: string }>();
const detected =
  typeof navigator === 'undefined' ? {} : detectPlatform(navigator.userAgent, navigator.platform);
const detail = ref<ResourceDetail>();
const loading = ref(true);
const failure = ref('');
const platform = ref('');
const arch = ref('');
const version = ref('');
const release = ref('');
const fileQuery = ref('');
const options = ref<FileOptions>({
  platforms: [],
  arches: [],
  versions: [],
  releases: [],
  roles: [],
});
const files = ref<Artifact[]>([]);
const nextCursor = ref<string | null>(null);
const fileLoading = ref(false);
let controller: AbortController | undefined;
let fileController: AbortController | undefined;
const resource = computed(() => detail.value?.resource);
const primary = computed(() => files.value[0]);
const platforms = computed(() =>
  options.value.platforms.filter((value) => value !== 'any' && value !== 'unknown'),
);
const arches = computed(() => options.value.arches.filter((value) => value !== 'unknown'));
const versions = computed(() => options.value.versions);
const filters = (): FileFilters => ({
  q: fileQuery.value.trim(),
  platform: platform.value,
  arch: arch.value,
  version: version.value,
  release: release.value,
});
async function update(append = false): Promise<void> {
  if (!resource.value) return;
  fileController?.abort();
  const request = new AbortController();
  fileController = request;
  fileLoading.value = true;
  failure.value = '';
  try {
    if (!append) {
      options.value = await loadFileOptions(
        props.id,
        { q: fileQuery.value.trim(), platform: platform.value, release: release.value },
        request.signal,
      );
      if (arch.value && !options.value.arches.includes(arch.value)) arch.value = '';
      if (version.value && !versions.value.includes(version.value)) version.value = '';
      if (!version.value && versions.value.length) version.value = versions.value[0] ?? '';
    }
    const page = await loadFiles(
      props.id,
      resource.value.downloadEntry,
      { ...filters(), ...(append && nextCursor.value ? { cursor: nextCursor.value } : {}) },
      request.signal,
    );
    if (request.signal.aborted) return;
    files.value = append ? [...files.value, ...page.items] : page.items;
    nextCursor.value = page.nextCursor;
  } catch (error) {
    if (!request.signal.aborted)
      failure.value = error instanceof Error ? error.message : '文件查询失败';
  } finally {
    if (!request.signal.aborted) fileLoading.value = false;
  }
}
async function refresh(id: string): Promise<void> {
  controller?.abort();
  fileController?.abort();
  const request = new AbortController();
  controller = request;
  detail.value = undefined;
  files.value = [];
  nextCursor.value = null;
  loading.value = true;
  failure.value = '';
  platform.value = '';
  arch.value = '';
  version.value = '';
  release.value = '';
  fileQuery.value = '';
  try {
    detail.value = await loadResource(id, request.signal);
    const available = await loadFileOptions(id, {}, request.signal);
    platform.value = detected.os && available.platforms.includes(detected.os) ? detected.os : '';
    arch.value = detected.arch && available.arches.includes(detected.arch) ? detected.arch : '';
    await update();
  } catch (error) {
    if (!request.signal.aborted)
      failure.value = error instanceof Error ? error.message : '资源查询失败';
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
onMounted(() => void refresh(props.id));
watch(
  () => props.id,
  (id) => void refresh(id),
);
onUnmounted(() => {
  controller?.abort();
  fileController?.abort();
});
</script>

<template>
  <div class="shell-inner">
    <div class="page resource-page">
      <div class="page-main">
        <p v-if="loading" class="hint">正在读取文件清单…</p>
        <p v-else-if="failure" role="alert" class="hint">{{ failure }}</p>

        <template v-else-if="resource">
          <p class="eyebrow">
            <RouterLink :to="{ name: 'site', params: { id: resource.siteId } }">{{
              resource.siteName
            }}</RouterLink>
            · {{ resource.ecosystemLabel }} · {{ KIND_LABELS[resource.kind] ?? resource.kind }}
          </p>
          <h1>{{ resource.name }}</h1>

          <details class="download-card" open>
            <summary>
              <span class="download-title">下载</span>
              <span class="hint">{{ primary ? primary.filename : '数据库文件清单' }}</span>
            </summary>

            <template v-if="resource">
              <div
                v-if="platforms.length > 1 || versions.length > 1 || arches.length > 1"
                class="download-fields"
              >
                <label v-if="platforms.length > 1"
                  >系统
                  <select v-model="platform" @change="update()">
                    <option value="">全部</option>
                    <option v-for="item in platforms" :key="item" :value="item">
                      {{ PLATFORM_LABELS[item] ?? item }}
                    </option>
                  </select>
                </label>
                <label v-if="arches.length > 1"
                  >架构
                  <select v-model="arch" @change="update()">
                    <option value="">全部</option>
                    <option v-for="item in arches" :key="item" :value="item">{{ item }}</option>
                  </select>
                </label>
                <label v-if="versions.length > 1"
                  >版本
                  <select v-model="version" @change="update()">
                    <option v-for="item in versions" :key="item" :value="item">
                      {{ item || '未标注版本' }}
                    </option>
                  </select>
                </label>
              </div>

              <ul class="download-list">
                <li v-for="file in files" :key="file.url" class="download-row">
                  <span class="download-file"
                    ><strong>{{ file.filename }}</strong
                    ><span class="hint"
                      >{{ file.arch === 'unknown' ? '' : file.arch }} ·
                      {{ humanSize(file.size) || '大小未知' }}</span
                    ></span
                  >
                  <a
                    class="btn btn-primary"
                    :href="file.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    >下载</a
                  >
                </li>
              </ul>
              <p v-if="files.length === 0" class="hint">此组合没有文件，请调整系统、架构或版本。</p>
              <p v-if="fileLoading" class="hint">正在查询数据库…</p>
            </template>

            <form
              class="download-fields"
              @submit.prevent="
                version = '';
                update();
              "
            >
              <label
                >包名 / 文件名<input
                  v-model="fileQuery"
                  type="search"
                  placeholder="查询已入库文件"
                  maxlength="200"
              /></label>
              <label v-if="options.releases.some((value) => value)"
                >发行版<select
                  v-model="release"
                  @change="
                    version = '';
                    update();
                  "
                >
                  <option value="">全部</option>
                  <option
                    v-for="item in options.releases.filter((value) => value)"
                    :key="item"
                    :value="item"
                  >
                    {{ item }}
                  </option>
                </select></label
              >
              <button class="btn" type="submit">查询</button>
            </form>
            <button
              v-if="nextCursor"
              class="btn"
              type="button"
              :disabled="fileLoading"
              @click="update(true)"
            >
              加载更多
            </button>
            <p v-if="files.length === 0 && !fileLoading" class="hint">
              没有符合条件的已入库文件；页面查询不会抓取源站。
            </p>

            <p class="download-origin">
              文件由 {{ resource.siteName }} 提供<span v-if="detail?.crawledAt"
                >，文件列表核对于 {{ new Date(detail.crawledAt).toLocaleString('zh-CN') }}</span
              ><span v-if="detail?.crawl?.result === 'failed'"
                >；最近一次刷新失败，上述文件来自旧快照</span
              ><span v-if="detail?.crawl?.result === 'partial'"
                >；上一轮采集未完成，保留上次有效数据</span
              >。
            </p>
          </details>

          <section class="tutorial-section"><p class="hint">教程待补充。</p></section>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.download-title {
  font-weight: 600;
}
.download-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.download-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.download-file {
  display: grid;
  min-width: 0;
}
.download-file strong {
  overflow-wrap: anywhere;
  font-weight: 500;
}
.download-more,
.directory-browser {
  margin-top: var(--space-3);
}
.directory-browser {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.directory-browser .download-fields input {
  min-width: 0;
  max-width: 100%;
}
.download-row .btn {
  flex: none;
}
.download-origin {
  margin: var(--space-3) 0 0;
  color: var(--ink-3);
  font-size: var(--size-sm);
}
.eyebrow {
  margin: 0;
}
</style>
