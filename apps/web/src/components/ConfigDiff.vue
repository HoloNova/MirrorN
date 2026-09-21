<script setup lang="ts">
import { computed } from 'vue';

import { describeConfigDiff, type ConfigDiffSummary } from '../lib/configDiff';

/**
 * "官方默认 → 镜像配置"对照卡。
 *
 * 与上面那块配置文件内容的区别：内容块回答"改完是什么样"，这里回答"哪几行会被改"。
 * 后者是新手最不放心的地方（我自己加的行会不会被覆盖、安全更新那几行动没动），
 * 所以把 `-` / `+` 摆出来，没列出的行就是不会动的行。
 *
 * 组件不做判断、不拼结论：差异与总结句都来自 lib/configDiff.ts 的纯函数。
 */
const props = defineProps<{
  /** 官方默认配置的来源名（例如「Ubuntu 官方归档」）。 */
  baselineName: string;
  /** 当前所选镜像名。 */
  mirrorName: string;
  diff: ConfigDiffSummary;
}>();

const summary = computed(() => describeConfigDiff(props.diff));
</script>

<template>
  <figure class="diff">
    <figcaption class="diff-head">
      <span class="diff-title">改动对照</span>
      <span class="diff-meta">{{ baselineName }} → {{ mirrorName }}</span>
    </figcaption>

    <ol class="diff-lines">
      <li
        v-for="(line, index) in diff.lines"
        :key="`${index}-${line.kind}`"
        class="diff-line"
        :data-kind="line.kind"
        :data-comment="line.comment"
      >
        <span class="diff-mark" aria-hidden="true">{{ line.kind === 'removed' ? '-' : '+' }}</span>
        <code>{{ line.text }}</code>
      </li>
    </ol>

    <p class="diff-foot">
      {{ summary }}
      <span class="diff-caveat"
        >对照的是官方默认配置，不是你机器上现在的文件：浏览器读不到本机的配置文件，也没有读取过
        其中的内容。</span
      >
    </p>
  </figure>
</template>
