<script setup lang="ts">
import { computed } from 'vue';

import { describeProbeView, type ProbeViewInput } from '../lib/probeView';

const props = defineProps<{
  view: ProbeViewInput;
  /** 是否是本轮推荐来源。 */
  recommended?: boolean;
}>();

const described = computed(() => describeProbeView(props.view));
</script>

<template>
  <span class="probe-badge" :class="`tone-${described.tone}`">
    <span class="probe-dot" aria-hidden="true" />
    <span class="probe-label">{{ described.label }}</span>
    <span v-if="props.recommended" class="probe-recommended">推荐</span>
    <span v-if="described.detail" class="probe-detail">{{ described.detail }}</span>
  </span>
</template>
