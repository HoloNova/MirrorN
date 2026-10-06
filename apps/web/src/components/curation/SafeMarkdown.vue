<script setup lang="ts">
import { computed } from 'vue';
import { renderMarkdown } from '../../lib/markdown';
const props = defineProps<{ source: string }>();
const html = computed(() => renderMarkdown(props.source));
</script>
<template>
  <!-- renderer先转义HTML，并仅允许HTTP(S)及站内链接；不接受原始HTML。 -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown" v-html="html" />
</template>
