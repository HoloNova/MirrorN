<script setup lang="ts">
import { RouterLink } from 'vue-router';

import { NAV_ITEMS } from '../lib/nav';
import ThemeSwitcher from './ThemeSwitcher.vue';

/**
 * 顶栏（doc 形态）。
 *
 * 生态文档页没有全局侧边栏（文档自带页内目录栏），三个模块入口改放在这条常驻顶栏里，
 * 于是读多长的文档都能直接切走。数据模式与主题跟着放右端，全站位置一致。
 */
defineProps<{ dataMode: string; dataState: 'online' | 'local' }>();
</script>

<template>
  <header class="topbar">
    <div class="shell-inner">
      <RouterLink class="brand" :to="{ name: 'home' }" aria-label="MirrorN 首页">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>MirrorN</span>
      </RouterLink>

      <nav class="top-nav" aria-label="主导航">
        <RouterLink
          v-for="item in NAV_ITEMS"
          :key="item.name"
          class="top-link"
          :to="{ name: item.name }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="topbar-end">
        <span class="data-mode" :data-state="dataState">{{ dataMode }}</span>
        <ThemeSwitcher />
      </div>
    </div>
  </header>
</template>
