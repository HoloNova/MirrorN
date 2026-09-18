<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { ref } from 'vue';

import SearchBar from '../components/SearchBar.vue';
import { getCatalog } from '../lib/ecosystems';

const catalog = getCatalog();
const searching = ref(false);
</script>

<template>
  <section class="hero" :class="{ 'is-searching': searching }" aria-labelledby="page-title">
    <p class="eyebrow">开发者工具链</p>
    <h1 id="page-title">找到适合你的依赖源。</h1>
    <p class="hero-copy">
      搜索生态或镜像站，按四步向导生成可复制的命令。页面只展示经过数据校验的来源，不会修改你的电脑配置。
    </p>

    <SearchBar @update:active="searching = $event" />
  </section>

  <section class="catalog-section" aria-labelledby="catalog-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">当前目录</p>
        <h2 id="catalog-title">常用包管理器</h2>
      </div>
      <span class="count-label">{{ catalog.ecosystems.length }} 个生态</span>
    </div>

    <div class="ecosystem-grid">
      <RouterLink
        v-for="ecosystem in catalog.ecosystems"
        :key="ecosystem.id"
        class="ecosystem-card"
        :to="{ name: 'ecosystem', params: { id: ecosystem.id } }"
      >
        <span class="card-kicker">{{ ecosystem.packageManager }}</span>
        <span class="card-title">{{ ecosystem.name }}</span>
        <span class="card-description">{{ ecosystem.description }}</span>
        <span class="card-footer">
          <span>{{ ecosystem.supports.length }} 个来源</span>
          <span class="card-arrow" aria-hidden="true">→</span>
        </span>
      </RouterLink>
    </div>
  </section>
</template>
