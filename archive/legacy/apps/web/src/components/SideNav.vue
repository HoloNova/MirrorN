<script setup lang="ts">
import { RouterLink } from 'vue-router';

import { NAV_ITEMS } from '../lib/nav';
import ThemeSwitcher from './ThemeSwitcher.vue';

/**
 * 左侧导航（首页 / 站点 / 帮助）。
 *
 * 只出现在 app 形态的页面里（见 App.vue 与 router.ts 的 meta.layout）：生态文档页是另一种形态，
 * 它把同样的三个入口放在常驻顶栏里（宽度只有一行，不会再吃掉一列）。
 *
 * 底部两行留给「数据模式」与主题：它们是全站设置，放在导航末端比塞进页面里更好找。
 */
defineProps<{ dataMode: string; dataState: 'online' | 'local' }>();
</script>

<template>
  <aside class="shell-aside">
    <nav class="side-nav" aria-label="主导航">
      <RouterLink class="side-brand" :to="{ name: 'home' }" aria-label="MirrorN 首页">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>MirrorN</span>
      </RouterLink>

      <ul class="side-list">
        <li v-for="item in NAV_ITEMS" :key="item.name">
          <RouterLink class="side-link" :to="{ name: item.name }">{{ item.label }}</RouterLink>
        </li>
      </ul>

      <div class="side-foot">
        <span class="data-mode" :data-state="dataState">{{ dataMode }}</span>
        <ThemeSwitcher />
      </div>
    </nav>
  </aside>
</template>
