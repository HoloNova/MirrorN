<script setup lang="ts">
import { computed } from 'vue';

import type { ProbeViewInput } from '../lib/probeView';
import { presentReadout } from '../lib/readout';

/**
 * 读数条：刻度长度 = 综合得分里的延迟分（见 lib/readout.ts），没有结果时显示 45° 剖面线。
 * 组件只负责"怎么画"，文案口径全部来自 probeView.ts。
 */
const props = defineProps<{
  view: ProbeViewInput;
  /** 是否是本轮推荐的来源：在读数条右侧显示一根刻度加文字，而不是彩色药丸。 */
  recommended?: boolean;
}>();

const readout = computed(() => presentReadout(props.view));
</script>

<template>
  <span
    class="readout"
    :data-state="readout.state"
    :data-tier="readout.tier"
    :title="readout.detail"
  >
    <span class="readout-track" aria-hidden="true">
      <span
        v-if="readout.score !== undefined"
        class="readout-fill"
        :style="{ '--value': String(readout.score) }"
      />
    </span>
    <span class="readout-value"
      >{{ readout.value }}<span v-if="readout.unit" class="unit">{{ readout.unit }}</span></span
    >
    <span v-if="recommended" class="mark">推荐</span>
  </span>
</template>
