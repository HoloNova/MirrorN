<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="shell-inner">
    <div class="page is-single">
      <div class="page-main">
        <div class="page-head">
          <h1 id="not-found-title">没有找到这个页面</h1>
          <span class="stamp">404</span>
        </div>

        <p class="hint">
          链接可能已经失效。首页的搜索框可以找到任意生态，站点页可以查看收录的镜像站。
        </p>

        <p class="rows-note">
          <RouterLink class="btn" :to="{ name: 'home' }">回到首页搜索</RouterLink>
          <RouterLink class="btn" :to="{ name: 'sites' }">查看镜像站</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
