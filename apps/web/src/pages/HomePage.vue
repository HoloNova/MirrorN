<script setup lang="ts">
import SearchBar from '../components/SearchBar.vue';
</script>
<template>
  <div class="shell-inner">
    <div class="page is-single home">
      <div class="page-main"><SearchBar /></div>
    </div>
  </div>
</template>
<style scoped>
.home {
  padding-top: 16vh;
}
.home .page-main {
  width: 100%;
  max-width: 720px;
  justify-self: center;
}
@media (max-width: 767px) {
  .home {
    padding-top: 10vh;
  }
}
</style>
