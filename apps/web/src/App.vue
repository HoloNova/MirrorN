<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import { computed } from 'vue';

import ThemeSwitcher from './components/ThemeSwitcher.vue';
import { resolveApiBase } from './composables/useMirrorStatus';

/**
 * 顶栏只放三件事：品牌、数据来源模式、主题切换。
 * 数据模式必须显示出来：静态模式（不发任何接口请求）与在线模式对用户来说是两种不同的可信度，
 * 不该让人猜。
 */
const dataMode = computed(() =>
  resolveApiBase() === undefined ? '静态数据模式' : '同步状态已连接',
);
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="shell-inner">
        <RouterLink class="brand" :to="{ name: 'home' }" aria-label="MirrorN 首页">
          <span class="brand-mark" aria-hidden="true"></span>
          <span>MirrorN</span>
        </RouterLink>
        <span class="brand-caption">镜像导航与依赖换源指南</span>
        <div class="topbar-end">
          <span class="data-mode">{{ dataMode }}</span>
          <ThemeSwitcher />
        </div>
      </div>
    </header>

    <main class="shell-main">
      <RouterView />
    </main>

    <footer class="footer">
      <div class="shell-inner">
        <span>数据与逻辑分离，来源可追溯</span>
        <span>页面不会修改你的电脑配置</span>
      </div>
    </footer>
  </div>
</template>
