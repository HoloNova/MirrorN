<script setup lang="ts">
import { computed } from 'vue';

import type { RankRow } from '../lib/rankRows';

import ProbeReadout from './ProbeReadout.vue';

/**
 * 排名表：所有来源画在同一条尺上。
 *
 * 与“每行一根独立长条”的区别：这里是固定轴（0–300ms），刻度线在每一行的同一个 x 上，
 * 因此行与行可以互相比较，“快多少”看得见。
 *
 * 一行 = 名称 + 性质 + 读数（刻度/耗时/分档）+ 可选的同步状态。
 * 同步状态是**按生态**分开的（同一站点在不同生态上是不同的上游作业），所以只有知道用户
 * 要配哪个生态的页面（生态文档）才传它；首页不传，这一列就不存在。
 *
 * 列宽由 styles/table.css 的 `--col-*` 变量控制：生态文档页把刻度列调窄即可复用同一个组件。
 *
 * 交互由父级决定：传 `interactive` 时整行可点（生态文档用它选来源），否则是纯展示。
 * 行的数据形状见 lib/rankRows.ts。
 */
const props = withDefaults(
  defineProps<{
    rows: RankRow[];
    /** 是否显示列标签行。首页不显示（第一视觉已经说明了每列是什么），文档页显示。 */
    head?: boolean;
    /** 是否显示刻度尺的标签行（0 / 100 / … / 300 ms）。 */
    axis?: boolean;
    /** 整行可点：生态文档用它切换来源。 */
    interactive?: boolean;
  }>(),
  { head: false, axis: true, interactive: false },
);

const emit = defineEmits<{ select: [id: string] }>();

const showSync = computed(() => props.rows.some((row) => row.sync !== undefined));

function onSelect(row: RankRow): void {
  if (props.interactive) {
    emit('select', row.id);
  }
}
</script>

<template>
  <div class="rows rank" :data-sync="showSync">
    <div v-if="head" class="row head">
      <span>来源</span>
      <span>性质</span>
      <span>读数刻度</span>
      <span class="row-value">耗时</span>
      <span>分档</span>
      <span v-if="showSync">同步状态</span>
    </div>

    <component
      :is="interactive ? 'button' : 'div'"
      v-for="row in rows"
      :key="row.id"
      class="row body"
      :type="interactive ? 'button' : undefined"
      :data-recommended="row.recommended"
      :aria-pressed="interactive ? row.recommended : undefined"
      @click="onSelect(row)"
    >
      <span class="row-name">
        <span class="text">{{ row.name }}</span>
      </span>
      <span class="kind">{{ row.kindLabel }}</span>

      <ProbeReadout :view="row.view" :recommended="row.recommended" />

      <span v-if="row.sync" class="row-sync" :data-tone="row.sync.tone">
        <span class="dot" aria-hidden="true"></span>
        <span>{{ row.sync.text }}</span>
        <span v-if="row.sync.detail" class="detail">{{ row.sync.detail }}</span>
      </span>
    </component>

    <div v-if="axis" class="row axis" aria-hidden="true">
      <span class="axis-cell">
        <span class="first k0" style="left: 0">0</span>
        <span class="minor k1" style="left: 16.667%">50</span>
        <span class="k2" style="left: 33.333%">100</span>
        <span class="minor k3" style="left: 50%">150</span>
        <span class="k4" style="left: 66.667%">200</span>
        <span class="minor k5" style="left: 83.333%">250</span>
        <span class="last k6" style="left: 100%">300 ms</span>
      </span>
    </div>
  </div>
</template>
