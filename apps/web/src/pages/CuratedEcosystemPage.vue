<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { CuratedDocument } from '@mirrorn/shared';
import { curatedDetail } from '../lib/curationApi';
import { loadNetworkFingerprint } from '../lib/resourceApi';
import EcosystemDocument from '../components/curation/EcosystemDocument.vue';
const props = defineProps<{ id: string }>();
const document = ref<CuratedDocument>();
const loading = ref(true);
const error = ref('');
const fingerprint = ref<string>();
let request: AbortController | undefined;
async function load() {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  document.value = undefined;
  fingerprint.value = undefined;
  loading.value = true;
  error.value = '';
  try {
    const doc = await curatedDetail(props.id, controller.signal);
    if (controller.signal.aborted) return;
    document.value = doc;
    // 只校验现有测速缓存的出口指纹；不在此处引入新一轮测速。
    if (doc.resources.some((resource) => resource.links.length > 1)) {
      try {
        const result = await loadNetworkFingerprint(controller.signal);
        if (!controller.signal.aborted) fingerprint.value = result;
      } catch {
        /* 指纹不可用时不使用测速缓存，基础下载仍可用。 */
      }
    }
  } catch (cause) {
    if (!controller.signal.aborted)
      error.value = cause instanceof Error ? cause.message : '读取失败';
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
}
watch(
  () => props.id,
  () => void load(),
);
onMounted(() => void load());
onUnmounted(() => request?.abort());
</script>
<template>
  <div class="shell-inner content-page">
    <RouterLink class="crumbs" :to="{ name: 'ecosystems' }">返回已收录生态</RouterLink>
    <p v-if="loading && !document" class="hint">读取生态…</p>
    <p v-if="error" class="content-error" role="alert">
      {{ error }} <button @click="load">重试</button>
    </p>
    <EcosystemDocument v-if="document" :document="document" :fingerprint="fingerprint" />
  </div>
</template>
