<script setup lang="ts">
import { RotateCw } from '@lucide/vue';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import ProbeReadout from '../components/ProbeReadout.vue';
import SearchBar from '../components/SearchBar.vue';
import { createMirrorProbeAccess } from '../composables/useMirrorProbes';
import { getCatalog } from '../lib/ecosystems';
import { pickHomeMeasureTargets } from '../lib/measureTargets';

const catalog = getCatalog();
const searching = ref(false);

const measureTargets = pickHomeMeasureTargets(catalog);
const mirrorName = (mirrorId: string): string =>
  catalog.mirrors.find((mirror) => mirror.id === mirrorId)?.name ?? mirrorId;

/**
 * 首页默认**不发起任何探测请求**：全站唯一会打到第三方镜像站的行为，必须由用户点一下开始。
 * `autoStart: false` 之后只有 refresh() 会真正测量。
 */
const probes = createMirrorProbeAccess({
  getTargets: () => measureTargets,
  autoStart: false,
});

const measured = ref(false);

function measure(): void {
  measured.value = true;
  probes.refresh();
}

const lastMeasuredLabel = computed<string | undefined>(() => {
  const at = probes.lastMeasuredAt.value;
  return at === undefined ? undefined : new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
});
</script>

<template>
  <div class="shell-inner">
    <section class="hero" :class="{ 'is-searching': searching }" aria-labelledby="page-title">
      <h1 id="page-title" class="hero-title">找到对你最快的那条线路。</h1>
      <p class="hero-lede">
        搜索生态或镜像站，测量你这台机器到各镜像的响应耗时，再照着文档一步步改配置。
        页面只展示经过数据校验的来源，也不会修改你的电脑配置。
      </p>

      <div class="hero-search">
        <SearchBar @update:active="searching = $event" />
      </div>

      <div v-if="!searching" class="measure">
        <div class="measure-head">
          <button class="btn" type="button" :disabled="probes.offline.value" @click="measure">
            <RotateCw
              :size="14"
              :class="{ 'icon-spin': probes.refreshing.value }"
              aria-hidden="true"
            />
            <span>{{ measured ? '重新测量' : '测量我的网络' }}</span>
          </button>
          <span class="measure-hint">
            {{
              probes.offline.value
                ? '浏览器报告当前处于离线状态，联网后可以重新测量。'
                : '点一下才会发起请求：由你的浏览器直连各镜像站上审核过的小资源，约 1–2 秒出结果。'
            }}
          </span>
          <span v-if="lastMeasuredLabel" class="measure-hint"
            >最近测量 {{ lastMeasuredLabel }}</span
          >
        </div>

        <div class="measure-rows">
          <div v-for="target in measureTargets" :key="target.mirrorId" class="measure-row">
            <span class="measure-name">{{ mirrorName(target.mirrorId) }}</span>
            <ProbeReadout
              :view="
                measured
                  ? probes.viewFor(target.mirrorId)
                  : { mirrorId: target.mirrorId, hasProbe: true, pending: false, stale: false }
              "
            />
          </div>
        </div>

        <p class="measure-hint">
          得到的是响应耗时估算（受
          DNS、连接复用与缓存影响），不代表下载速度，也不能证明仓库内容正常。
        </p>
      </div>
    </section>

    <section v-if="!searching" aria-labelledby="catalog-title">
      <div class="section-label">
        <span id="catalog-title">当前目录</span>
        <span class="num">{{ catalog.ecosystems.length }} 个生态</span>
      </div>

      <div class="ledger">
        <div class="ledger-head">
          <span>生态</span>
          <span>说明</span>
          <span>来源</span>
        </div>
        <RouterLink
          v-for="ecosystem in catalog.ecosystems"
          :key="ecosystem.id"
          class="ledger-row"
          :to="{ name: 'ecosystem', params: { id: ecosystem.id } }"
        >
          <span class="ledger-name">{{ ecosystem.name }}</span>
          <span class="ledger-desc">{{ ecosystem.description }}</span>
          <span class="ledger-meta">{{ ecosystem.supports.length }}</span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
