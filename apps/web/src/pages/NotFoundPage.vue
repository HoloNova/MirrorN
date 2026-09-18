<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="empty-state" aria-labelledby="not-found-title">
    <p class="eyebrow">404</p>
    <h1 id="not-found-title">没有找到这个页面。</h1>
    <p class="hero-copy">
      链接可能已经失效，或者该生态还没有加入数据目录。你可以回到首页查看当前支持的生态。
    </p>
    <RouterLink class="primary-link" :to="{ name: 'home' }">返回首页</RouterLink>
  </section>
</template>
