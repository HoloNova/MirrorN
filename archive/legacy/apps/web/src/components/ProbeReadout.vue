<script setup lang="ts">
import { computed } from 'vue';

import type { ProbeViewInput } from '../lib/probeView';
import { presentReadout } from '../lib/readout';

/**
 * 读数：刻度 + 毫秒数 + 分档词。
 *
 * 两种形态，由 `variant` 决定：
 *
 *   'row'     排名表里的一行。根元素 `display: contents`，于是刻度、耗时、分档三个格子
 *             直接落进外层表格的栅格——所有行的刻度因此天然对齐在同一条水平线上。
 *   'inline'  参数条、搜索结果这类窄位置用的一行紧凑写法。
 *
 * 组件只负责“怎么画”，文案口径全部来自 probeView.ts；刻度长度与分档同源（见 lib/readout.ts），
 * 不会出现“刻度短却写着快”这种自相矛盾的读数。
 */
const props = withDefaults(
  defineProps<{
    view: ProbeViewInput;
    variant?: 'row' | 'inline';
    /** 是否是本轮推荐的来源：在分档词前显示一个小标记，而不是彩色药丸。 */
    recommended?: boolean;
  }>(),
  { variant: 'row', recommended: false },
);

const readout = computed(() => presentReadout(props.view));
</script>

<template>
  <span
    class="readout"
    :data-state="readout.state"
    :data-tier="readout.tier"
    :data-variant="props.variant"
    :title="readout.detail"
  >
    <span class="readout-track" aria-hidden="true">
      <span
        v-if="readout.axisRatio !== undefined"
        class="readout-fill"
        :style="{ '--value': String(readout.axisRatio) }"
      />
    </span>

    <span class="readout-value">
      <template v-if="readout.state === 'measured'"
        >{{ readout.value }}<span class="unit">ms</span></template
      >
      <template v-else>—</template>
    </span>

    <span class="readout-tier">
      <span v-if="props.recommended && readout.state === 'measured'" class="chip-rec">推荐</span>
      <span v-if="readout.tierLabel" class="readout-tier-word">{{ readout.tierLabel }}</span>
      <span v-else class="readout-tier-state">{{ readout.value }}</span>
    </span>
  </span>
</template>
