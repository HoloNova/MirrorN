<script setup lang="ts">
import { Check, Copy } from '@lucide/vue';
import { onUnmounted, ref } from 'vue';

import { copyText } from '../lib/clipboard';

const props = defineProps<{
  command: string;
  label?: string;
  note?: string;
  language?: string;
}>();

const state = ref<'idle' | 'copied' | 'failed'>('idle');
const message = ref('');
let resetTimer: ReturnType<typeof setTimeout> | undefined;

async function handleCopy(): Promise<void> {
  const result = await copyText(props.command);

  if (result.ok) {
    state.value = 'copied';
    message.value = '已复制到剪贴板';
  } else {
    state.value = 'failed';
    message.value = result.message;
  }

  if (resetTimer !== undefined) {
    clearTimeout(resetTimer);
  }
  resetTimer = setTimeout(() => {
    state.value = 'idle';
    message.value = '';
  }, 2000);
}

onUnmounted(() => {
  if (resetTimer !== undefined) {
    clearTimeout(resetTimer);
  }
});
</script>

<template>
  <div class="command-block">
    <div class="command-head">
      <span class="command-label">{{ label ?? '命令' }}</span>
      <button class="copy-button" type="button" @click="handleCopy">
        <Check v-if="state === 'copied'" :size="14" aria-hidden="true" />
        <Copy v-else :size="14" aria-hidden="true" />
        <span>{{ state === 'copied' ? '已复制' : '复制' }}</span>
      </button>
    </div>
    <pre class="command-body"><code>{{ command }}</code></pre>
    <p v-if="note" class="command-note">{{ note }}</p>
    <p v-if="state === 'failed'" class="command-error" role="alert">{{ message }}</p>
    <p v-else-if="state === 'copied'" class="command-success" aria-live="polite">{{ message }}</p>
  </div>
</template>
