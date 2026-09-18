<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { computed } from 'vue';

const route = useRoute();
const isHome = computed(() => route.name === 'home');
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink class="brand" :to="{ name: 'home' }" aria-label="MirrorN 首页">
        <span class="brand-mark" aria-hidden="true">M</span>
        <span>MirrorN</span>
      </RouterLink>
      <span class="topbar-caption">智能镜像导航与开发环境配置</span>
      <span class="status-label"
        ><span class="status-dot" aria-hidden="true"></span>本地数据模式</span
      >
    </header>

    <main class="content" :class="{ 'content-narrow': !isHome }">
      <RouterView />
    </main>

    <footer class="footer">
      <span>本地静态数据模式 · 无需后端</span>
      <span>数据与逻辑分离，来源可追溯</span>
    </footer>
  </div>
</template>
