<script setup lang="ts">
import { ChevronRight } from '@lucide/vue';

import type { Troubleshooting } from '@mirrorn/shared';

/** 排错条目：正文太长，用折叠承载；折叠里同样给出依据与核对日期。 */
defineProps<{ entries: Troubleshooting[] }>();
</script>

<template>
  <div v-if="entries.length > 0" class="troubleshooting">
    <details v-for="entry in entries" :key="entry.id" class="disclosure">
      <summary>
        <span>{{ entry.title }}</span>
        <ChevronRight :size="16" class="disclosure-chevron" aria-hidden="true" />
      </summary>
      <div class="disclosure-body">
        <p>{{ entry.problem }}</p>
        <ol class="trouble-steps">
          <li v-for="step in entry.steps" :key="step.title">
            <span class="trouble-step-title">{{ step.title }}</span>
            <span class="trouble-step-content">{{ step.content }}</span>
          </li>
        </ol>
        <p class="trouble-sources">
          <span>依据：</span>
          <a
            v-for="source in entry.sources"
            :key="source.url"
            :href="source.url"
            target="_blank"
            rel="noreferrer noopener"
            >{{ source.url }}</a
          >
          <span>核对于 {{ entry.sources[0].checkedAt }}</span>
        </p>
      </div>
    </details>
  </div>
</template>
