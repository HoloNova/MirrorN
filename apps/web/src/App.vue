<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';

import SideNav from './components/SideNav.vue';
import TopBar from './components/TopBar.vue';
import { resolveApiBase } from './composables/useMirrorStatus';

/**
 * 外壳有两种形态，由路由的 meta.layout 决定：
 *
 *   'app'  首页 / 站点 / 帮助：左侧常驻导航（品牌 + 三个模块 + 数据模式 + 主题切换）。
 *   'doc'  生态文档：顶栏 + 常驻的横向模块导航，不占额外一列（文档自带页内目录栏）。
 *
 * 数据模式必须显示出来：静态模式（不发任何接口请求）与在线模式对用户来说是两种不同的可信度，
 * 因此连圆点的颜色也分开——在线是绿，本地数据是琥珀。
 */
const route = useRoute();
const layout = computed(() => (route.meta.layout === 'doc' ? 'doc' : 'app'));
const online = computed(() => resolveApiBase() !== undefined);
const dataMode = computed(() => (online.value ? '同步状态在线' : '本地数据'));
const dataState = computed<'online' | 'local'>(() => (online.value ? 'online' : 'local'));
</script>

<template>
  <div class="shell" :data-layout="layout">
    <SideNav v-if="layout === 'app'" :data-mode="dataMode" :data-state="dataState" />

    <div class="shell-body">
      <TopBar v-if="layout === 'doc'" :data-mode="dataMode" :data-state="dataState" />

      <main class="shell-main">
        <RouterView />
      </main>
    </div>
  </div>
</template>
