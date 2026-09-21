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
    <div class="page is-single">
      <div class="page-main">
        <div class="page-head">
          <h1 id="missing-title">没有找到这个生态</h1>
          <span class="stamp">404</span>
        </div>
        <p class="hint">
          链接可能已经失效，或者该生态还没有加入数据目录。你可以回到首页搜索，或查看镜像站目录。
        </p>
        <p class="rows-note">
          <RouterLink class="btn" :to="{ name: 'home' }">回到首页搜索</RouterLink>
          <RouterLink class="btn" :to="{ name: 'sites' }">查看镜像站</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
