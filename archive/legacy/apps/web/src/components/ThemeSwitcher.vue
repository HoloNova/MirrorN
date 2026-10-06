<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue';

import { THEMES, type ThemeChoice } from '../lib/theme';
import { useTheme } from '../composables/useTheme';

const { choice, theme, setChoice } = useTheme();

/** 三个选项：跟随系统 + 注册表里的每个主题。图标只作辅助，title/aria-label 才是可读名称。 */
const OPTIONS: Array<{
  value: ThemeChoice;
  label: string;
  icon: typeof Monitor;
}> = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  ...THEMES.map((item) => ({
    value: item.id as ThemeChoice,
    label: item.label,
    icon: item.scheme === 'dark' ? Moon : Sun,
  })),
];
</script>

<template>
  <div class="seg" role="group" aria-label="界面主题">
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      :aria-pressed="choice === option.value"
      :aria-label="`主题：${option.label}${option.value === 'system' ? `（当前为${theme === 'carbon' ? '碳黑' : '测绘图'}）` : ''}`"
      :title="option.label"
      @click="setChoice(option.value)"
    >
      <component :is="option.icon" :size="14" aria-hidden="true" />
    </button>
  </div>
</template>
