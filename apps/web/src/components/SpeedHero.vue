<script setup lang="ts">
import type { ReadoutTier } from '../lib/readout';

/**
 * 首页第一视觉：本轮最快的那个来源。
 *
 * 为什么把它做大：整页要回答的就是“换哪个来源”，答案本身应该是最显眼的元素，
 * 而不是藏在表格里的一行。搜索框退成普通控件，不再抢第一眼。
 *
 * 三种状态对应三种事实，不互相借用：未测速（还没测）、测速中（正在测）、已测速（有结果）。
 * 这里不写机制说明，也不写“点这里会发生什么”——那是按钮和帮助文档的事。
 */
defineProps<{
  state: 'untested' | 'measuring' | 'measured';
  /** 已测速时有值：本轮最快来源的耗时（毫秒）。 */
  ms?: number;
  /** 已测速时有值：该来源名称。 */
  station?: string;
  tierLabel?: string;
  tier?: ReadoutTier;
  recommended?: boolean;
  /** 本轮参与测速的来源数量，用于未测速与测速中的一行说明。 */
  sourceCount?: number;
  /** 兜底态的一行说明（离线 / 本次没成功）。正常路径不传。 */
  note?: string;
}>();
</script>

<template>
  <section class="hero" :data-state="state">
    <p class="hero-readout">
      <template v-if="state === 'measured'">
        <b class="hero-value">{{ ms }}</b>
        <span class="hero-unit">ms</span>
      </template>
      <span v-else class="hero-void" aria-hidden="true">—</span>
    </p>

    <div class="hero-who">
      <p class="hero-name">
        {{ state === 'measured' ? station : state === 'measuring' ? '测速中' : '未测速' }}
      </p>
      <p class="hero-flags">
        <template v-if="state === 'measured'">
          <span v-if="recommended" class="chip-rec">推荐</span>
          <span v-if="tierLabel" class="hero-tier" :data-tier="tier">{{ tierLabel }}</span>
        </template>
        <template v-else-if="state === 'measuring' && sourceCount">
          <span class="hero-sub">正在测 {{ sourceCount }} 个来源</span>
        </template>
        <template v-else-if="note">
          <span class="hero-sub">{{ note }}</span>
        </template>
        <template v-else-if="sourceCount">
          <span class="hero-sub">可测 {{ sourceCount }} 个来源</span>
        </template>
      </p>
    </div>

    <div class="hero-action">
      <slot />
    </div>
  </section>
</template>
