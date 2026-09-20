<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="shell-inner">
    <section class="section is-first" aria-labelledby="not-found-title">
      <div class="section-head">
        <span class="section-num">404</span>
        <h1 id="not-found-title">没有找到这个页面。</h1>
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
