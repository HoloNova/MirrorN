<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import EcosystemDoc from '../components/EcosystemDoc.vue';
import { getCatalog } from '../lib/ecosystems';

const route = useRoute();
const catalog = getCatalog();

const ecosystem = computed(() =>
  catalog.ecosystems.find((item) => item.id === String(route.params.id ?? '')),
);
</script>

<template>
  <!--
    :key 让换生态时重建文档组件：vue-router 在同一组件内换参数不会重新挂载，
    否则会把上一个生态的来源选择、进度与探测状态带过来。
  -->
  <EcosystemDoc v-if="ecosystem" :key="ecosystem.id" :ecosystem="ecosystem" />

  <div v-else class="shell-inner">
    <section class="section is-first" aria-labelledby="missing-title">
      <div class="section-head">
        <span class="section-num">404</span>
        <h1 id="missing-title">没有找到这个生态。</h1>
      </div>
      <div class="section-body">
        <p>链接可能已经失效，或者该生态还没有加入数据目录。你可以回到首页查看当前支持的生态。</p>
        <div class="actions">
          <RouterLink class="btn btn-primary" :to="{ name: 'home' }">返回首页</RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>
