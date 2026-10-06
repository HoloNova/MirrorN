<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CuratedResource } from '@mirrorn/shared';
import { selectDownloadCandidate, rememberSite } from '../../lib/downloadPreference';
import { getMirror } from '../../lib/ecosystems';
import { humanSize } from '../../lib/downloads';
import type { DownloadCandidate } from '../../lib/resourceApi';
const props = defineProps<{
  resource: CuratedResource;
  ecosystemId: string;
  fingerprint?: string;
  preview?: boolean;
}>();
const selected = ref('');
const manual = ref(false);
const actionLabels = { file: '下载文件', directory: '浏览目录', repository: '查看仓库／配置入口' };
const candidates = computed<DownloadCandidate[]>(() =>
  props.resource.links.map((link) => {
    const mirror = link.siteId ? getMirror(link.siteId) : undefined;
    const matchingHost =
      mirror && new URL(mirror.homepageUrl).hostname === new URL(link.url).hostname;
    return {
      id: link.id,
      siteId: link.siteId || link.id,
      siteName: link.label,
      downloadEntry: link.url,
      region: matchingHost && mirror.kind !== 'official' ? 'CN' : 'unknown',
      artifactCount: 1,
      ...(matchingHost && mirror.probe ? { probe: mirror.probe } : {}),
    };
  }),
);
const source = computed(() => props.resource.links.find((link) => link.id === selected.value));
function choose() {
  manual.value = true;
  if (source.value?.siteId && !props.preview)
    rememberSite(`${props.ecosystemId}:${props.resource.id}`, source.value.siteId);
}
watch(
  () => [props.resource, props.fingerprint],
  () => {
    if (!manual.value || !source.value)
      selected.value =
        selectDownloadCandidate(
          candidates.value,
          `${props.ecosystemId}:${props.resource.id}`,
          undefined,
          props.fingerprint,
        ) ||
        props.resource.links[0]?.id ||
        '';
  },
  { immediate: true },
);
</script>
<template>
  <article class="content-resource">
    <div>
      <h3>{{ resource.title }}</h3>
      <p class="hint">
        {{ [resource.platform, resource.arch, resource.format].filter(Boolean).join(' / ')
        }}<template v-if="resource.sizeBytes !== null">
          · {{ humanSize(resource.sizeBytes) }}</template
        >
      </p>
    </div>
    <div class="content-download">
      <label :for="`${resource.id}-source`">来源</label>
      <select :id="`${resource.id}-source`" v-model="selected" @change="choose">
        <option v-for="link in resource.links" :key="link.id" :value="link.id">
          {{ link.label }}
        </option>
      </select>
      <a
        v-if="source"
        class="content-button primary"
        :href="source.url"
        target="_blank"
        rel="noopener noreferrer"
        >{{ actionLabels[resource.kind] }}</a
      >
    </div>
    <p v-if="resource.links.length > 1" class="hint">
      沿用已有的来源偏好和有效测速缓存；没有测量结果时按维护顺序选择，可手动切换。
    </p>
    <p v-if="source?.note" class="hint">{{ source.note }}</p>
    <details>
      <summary>文件与来源详情</summary>
      <p v-if="resource.filename">{{ resource.filename }}</p>
      <p v-if="resource.sha256" class="content-checksum">SHA256：{{ resource.sha256 }}</p>
      <ul>
        <li v-for="link in resource.links" :key="link.id">
          <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.label }}</a
          ><span v-if="link.checkedAt" class="hint"> · 人工核查 {{ link.checkedAt }}</span>
        </li>
      </ul>
    </details>
  </article>
</template>
