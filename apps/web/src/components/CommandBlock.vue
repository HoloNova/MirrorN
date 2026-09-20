<script setup lang="ts">
import { Check, Copy } from '@lucide/vue';
import { computed, onUnmounted, ref } from 'vue';

import { PACKAGE_NAME_PLACEHOLDER } from '@mirrorn/shared/generators';

import { copyText } from '../lib/clipboard';

const props = defineProps<{
  command: string;
  label?: string;
  note?: string;
}>();

const state = ref<'idle' | 'copied' | 'failed'>('idle');
const message = ref('');
let resetTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 把命令里需要用户自己替换的 `<包名>` 拆出来单独上色。
 * 拆成片段而不是用 v-html：命令来自数据文件，不应该走 HTML 解析那条路。
 */
const segments = computed(() => {
  const pieces = props.command.split(PACKAGE_NAME_PLACEHOLDER);
  const result: Array<{ text: string; placeholder: boolean }> = [];
  pieces.forEach((piece, index) => {
    if (index > 0) {
      result.push({ text: PACKAGE_NAME_PLACEHOLDER, placeholder: true });
    }
    if (piece.length > 0) {
      result.push({ text: piece, placeholder: false });
    }
  });
  return result;
});

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
  <div class="command">
    <div class="command-head">
      <span class="command-label">{{ label ?? '命令' }}</span>
      <button
        class="copy"
        type="button"
        :data-state="state === 'idle' ? undefined : state"
        @click="handleCopy"
      >
        <Check v-if="state === 'copied'" :size="13" aria-hidden="true" />
        <Copy v-else :size="13" aria-hidden="true" />
        <span>{{ state === 'copied' ? '已复制' : '复制' }}</span>
      </button>
    </div>
    <!-- prettier-ignore -->
    <pre class="command-body"><code><span v-for="(segment, index) in segments" :key="index" :class="{ ph: segment.placeholder }">{{ segment.text }}</span></code></pre>
    <p v-if="note" class="command-note">{{ note }}</p>
    <p v-if="state === 'failed'" class="command-msg" data-tone="bad" role="alert">{{ message }}</p>
    <p v-else-if="state === 'copied'" class="command-msg" data-tone="ok" aria-live="polite">
      {{ message }}
    </p>
  </div>
</template>
