<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import RankTable from '../components/RankTable.vue';
import SearchBar from '../components/SearchBar.vue';
import SpeedHero from '../components/SpeedHero.vue';
import { createMirrorProbeAccess } from '../composables/useMirrorProbes';
import { useMirrorStatus } from '../composables/useMirrorStatus';
import { getCatalog } from '../lib/ecosystems';
import { pickHomeMeasureTargets } from '../lib/measureTargets';
import { MIRROR_KIND_LABELS } from '../lib/mirrorKind';
import { sortByLatency, type RankRow } from '../lib/rankRows';
import { waitForFingerprint } from '../lib/statusApi';
import { presentReadout } from '../lib/readout';

/**
 * 首页 = 搜索框 + 本轮测速结果（只列最快 3 个）+ 一列真实数据。
 *
 * 测速策略（与用户约定）：
 *   1. **打开页面自动测**：本地缓存新鲜（3 小时内、且是同一个网络）就一个请求都不发，
 *      直接显示上次的结果；过期或换网才重新测；
 *   2. **首页不提供手动测速**：来源变多时首页手动重测会一次发出很多请求（生态文档页仍然
 *      保留手动「测速」，那里的来源是用户正在配的那个生态，量小且意图明确）；
 *   3. **失败不覆盖数据**：某个来源这次没测到，就继续显示上次成功的值，只在悬停提示里说明；
 *   4. 只有两种异常态给「重试」：离线、或本轮全部失败（否则页面会变成没有出口的死页）。
 *
 * 首页不显示同步状态：同步状态是按生态分开的（同一站点在不同生态上是不同的上游作业），
 * 首页还不知道用户要配哪个生态，写一个模棱两可的状态等于误导；要看去生态文档。
 */
const catalog = getCatalog();
const searching = ref(false);

/** 候选来源：数据驱动（声明了探针 + 被最多生态共用），见 lib/measureTargets.ts。 */
const targets = pickHomeMeasureTargets(catalog);
const mirrorById = new Map(catalog.mirrors.map((mirror) => [mirror.id, mirror]));

// 网络指纹：只用来判断“缓存里的数字是不是在当前网络下测的”。
// autoStart: false —— 首页不显示同步状态，因此只需要指纹这一次同源请求，不拉 /api/mirrors。
const statusAccess = useMirrorStatus({ autoStart: false });

const probes = createMirrorProbeAccess({
  getTargets: () => targets,
  getFingerprint: () => statusAccess.fingerprintValue.value,
  autoStart: false,
});

/**
 * 先问指纹再决定测谁：这样才能把“换了网络”与“还没测过”分开。
 * 等它有上限（见 waitForFingerprint）：后端慢或挂掉时最多等一秒就开测，不让页面空转。
 */
onMounted(async () => {
  await waitForFingerprint(statusAccess);
  probes.revalidate();
});

/** 排名行的数据形状：读数与分档都来自 lib/readout.ts，页面只做排序与截断。 */
const ranked = computed(() =>
  sortByLatency(
    targets.map((target) => {
      const mirror = mirrorById.get(target.mirrorId);
      const view = probes.viewFor(target.mirrorId);
      return {
        id: target.mirrorId,
        name: mirror?.name ?? target.mirrorId,
        kindLabel: MIRROR_KIND_LABELS[mirror?.kind ?? 'community'],
        view,
        readout: presentReadout(view),
      };
    }),
  ),
);

/** 只留最快 3 个：来源变多以后这一屏也不能变长，第 4 名之后只计数。 */
const topRows = computed<RankRow[]>(() =>
  ranked.value.slice(0, 3).map((row) => ({
    id: row.id,
    name: row.name,
    kindLabel: row.kindLabel,
    view: row.view,
    recommended: row.id === probes.recommendedMirrorId.value,
  })),
);

const fastest = computed(() => ranked.value.find((row) => row.readout.state === 'measured'));

const measuredCount = computed(
  () => ranked.value.filter((row) => row.readout.state === 'measured').length,
);

/**
 * 三种状态。没有数据且不在测 = 异常态（离线或本轮全失败），这时才给重试入口。
 * 「未测速」文案只作为这一档的兜底出现，正常路径是 测速中 → 有数据。
 */
const state = computed<'untested' | 'measuring' | 'measured'>(() => {
  if (measuredCount.value > 0) {
    return 'measured';
  }
  return probes.refreshing.value ? 'measuring' : 'untested';
});

const canRetry = computed(
  () =>
    measuredCount.value === 0 &&
    !probes.refreshing.value &&
    (probes.offline.value || probes.lastRoundFailures.value > 0),
);

const heroNote = computed<string | undefined>(() => {
  if (state.value !== 'untested') {
    return undefined;
  }
  return probes.offline.value ? '当前离线，联网后会自动测速' : '本次测速没有成功';
});

/** 结果的年龄：每次都照实显示上次测速的时刻，不因为缓存命中而藏起来。 */
const lastMeasuredLabel = computed<string | undefined>(() => {
  const at = probes.lastMeasuredAt.value;
  return at === undefined ? undefined : new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
});

function retry(): void {
  probes.refresh();
}

// ── 右列的四块真实数据 ──────────────────────────────────────────────────
const repoMirrorIds = new Set(
  catalog.ecosystems.flatMap((ecosystem) => ecosystem.supports.map((support) => support.mirrorId)),
);
const statusMirrorCount = catalog.mirrors.filter((mirror) => mirror.statusSource).length;
const probeMirrorCount = catalog.mirrors.filter((mirror) => mirror.probe).length;
const checkedAt = catalog.ecosystems
  .flatMap((ecosystem) => ecosystem.sources.map((source) => source.checkedAt))
  .sort()
  .at(-1);
</script>

<template>
  <div class="shell-inner">
    <div class="page home" :data-state="state" :data-searching="searching">
      <div class="page-main">
        <SearchBar @update:active="searching = $event" />

        <div class="page-head">
          <h1>各镜像站响应耗时</h1>
          <span class="stamp">
            {{
              state === 'untested'
                ? '未测速'
                : lastMeasuredLabel
                  ? `上次测速 ${lastMeasuredLabel}`
                  : '测速中'
            }}
          </span>
        </div>

        <SpeedHero
          :state="state"
          :ms="fastest?.view.result?.durationMs ?? undefined"
          :station="fastest?.name"
          :tier-label="fastest?.readout.tierLabel"
          :tier="fastest?.readout.tier"
          :recommended="fastest !== undefined && fastest.id === probes.recommendedMirrorId.value"
          :source-count="targets.length"
          :note="heroNote"
        >
          <!--
            首页平时没有测速按钮：打开页面就自动测，缓存新鲜时一个请求都不发；
            只有异常态（离线、或本轮全部失败）才给这个出口，否则页面会卡在“没有数字”上。
          -->
          <button v-if="canRetry" class="btn" type="button" @click="retry">重试</button>
        </SpeedHero>

        <div class="home-rank">
          <RankTable :rows="topRows" :axis="true" />
        </div>

        <p class="rows-note">
          <span>
            {{
              state === 'measured'
                ? `已测 ${measuredCount} 个来源，这里是最快的 ${topRows.length} 个`
                : '测速后这里显示最快的 3 个来源'
            }}
          </span>
          <RouterLink :to="{ name: 'sites' }">看全部站点</RouterLink>
        </p>

        <p class="footline">
          <span>
            打开页面会自动测速，结果存在本机、3 小时内不重复测；数字是响应耗时估算，不是下载速度。
            <RouterLink :to="{ name: 'help', params: { id: 'probe' } }">口径见帮助</RouterLink>
          </span>
          <span>数据来自各站公开发布的仓库地址与状态文件</span>
        </p>
      </div>

      <div class="page-meta">
        <div class="meta-block">
          <h2>常用生态</h2>
          <div class="eco-chips">
            <RouterLink
              v-for="ecosystem in catalog.ecosystems"
              :key="ecosystem.id"
              :to="{ name: 'ecosystem', params: { id: ecosystem.id } }"
            >
              {{ ecosystem.packageManager }}
            </RouterLink>
          </div>
        </div>

        <div class="meta-block">
          <h2>本次会话</h2>
          <dl class="kv">
            <div>
              <dt>已测来源</dt>
              <dd class="num">{{ measuredCount }} / {{ targets.length }}</dd>
            </div>
            <div v-if="lastMeasuredLabel">
              <dt>上次测速</dt>
              <dd class="num">{{ lastMeasuredLabel }}</dd>
            </div>
            <div v-if="checkedAt">
              <dt>数据核对</dt>
              <dd class="num">{{ checkedAt }}</dd>
            </div>
          </dl>
        </div>

        <div class="meta-block">
          <h2>数据覆盖</h2>
          <dl class="kv">
            <div>
              <dt>镜像站</dt>
              <dd class="num">{{ catalog.mirrors.length }}</dd>
            </div>
            <div>
              <dt>生态</dt>
              <dd class="num">{{ catalog.ecosystems.length }}</dd>
            </div>
            <div>
              <dt>公开状态文件</dt>
              <dd class="num">{{ statusMirrorCount }} 站</dd>
            </div>
          </dl>
        </div>

        <div class="meta-block">
          <h2>数据来源</h2>
          <dl class="kv">
            <div>
              <dt>仓库地址</dt>
              <dd class="num">{{ repoMirrorIds.size }} 站</dd>
            </div>
            <div>
              <dt>探针地址</dt>
              <dd class="num">{{ probeMirrorCount }} 站</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </div>
</template>
