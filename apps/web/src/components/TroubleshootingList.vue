<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';

import type { Troubleshooting } from '@mirrorn/shared';

defineProps<{ entries: Troubleshooting[] }>();
</script>

<template>
  <section
    v-if="entries.length > 0"
    class="troubleshooting"
    aria-labelledby="troubleshooting-title"
  >
    <div class="section-heading">
      <div>
        <p class="eyebrow">排错</p>
        <h2 id="troubleshooting-title">常见问题</h2>
      </div>
      <span class="count-label">{{ entries.length }} 条</span>
    </div>

    <details v-for="entry in entries" :key="entry.id" class="trouble-card">
      <summary>
        <span class="trouble-title">{{ entry.title }}</span>
        <ChevronDown :size="16" class="trouble-chevron" aria-hidden="true" />
      </summary>
      <div class="trouble-body">
        <p class="trouble-problem">{{ entry.problem }}</p>
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
          <span class="trouble-checked">核对于 {{ entry.sources[0].checkedAt }}</span>
        </p>
      </div>
    </details>
  </section>
</template>
