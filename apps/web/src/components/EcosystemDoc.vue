<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import type { Ecosystem } from '@mirrorn/shared';
import { SYNC_UNKNOWN } from '@mirrorn/shared/sync';
import { GUIDE_MODE_LABELS, type GeneratedConfigFile } from '@mirrorn/shared/generators';

import ConfigDiff from './ConfigDiff.vue';
import CommandBlock from './CommandBlock.vue';
import RankTable from './RankTable.vue';
import TroubleshootingList from './TroubleshootingList.vue';
import { createMirrorProbeAccess, toProbeTargets } from '../composables/useMirrorProbes';
import { useMirrorStatus } from '../composables/useMirrorStatus';
import { buildConfigDiffView } from '../lib/configBaseline';
import { getTroubleshooting, listEcosystemMirrors } from '../lib/ecosystems';
import { createGuideParams, GUIDE_SECTIONS, type GuideSectionId } from '../lib/guideParams';
import { createProgressStore, type GuideAction } from '../lib/guideProgress';
import { MIRROR_KIND_LABELS } from '../lib/mirrorKind';
import { latencyOf, type RankRow } from '../lib/rankRows';
import { waitForFingerprint } from '../lib/statusApi';
import { describeSyncStatus } from '../lib/statusView';

/**
 * 生态页的文档形态。
 *
 * 版面分三层：顶栏（模块导航，在外壳里）→ 参数条（系统/终端/版本/来源）→ 页内目录 + 正文。
 * **所有章节一次渲染**，参数条只负责筛选这一页显示哪些命令；内容不因为“没点下一步”而消失。
 *
 * 三种配置方式也一次全部列出（不做选项卡）：少了哪一种，编号就不会出现空位，
 * 用户不需要猜“另一页里是不是还有个更合适的做法”。
 */
const props = defineProps<{ ecosystem: Ecosystem }>();

const {
  os,
  shell,
  version,
  mirrorId,
  platforms,
  shells,
  versions,
  versionLabel,
  guide,
  detectionNote,
  mirrorPinned,
  setOs,
  setShell,
  setVersion,
  setMirror,
  applyRecommendation,
} = createGuideParams(props.ecosystem);

const mirrors = listEcosystemMirrors(props.ecosystem);
const troubleshooting = getTroubleshooting(props.ecosystem.id);

// 候选只包含数据里声明了探针的来源；其余来源显示“无法测量”。
// 用 createMirrorProbeAccess 而不是 useMirrorProbes：测速初始化失败时降级为“无法测量”，
// 不让整页打不开（失败原因见浏览器控制台）。
const probeTargets = toProbeTargets(mirrors);

// 先建状态接入，再建测速接入：同步状态参与推荐评分，而状态里的网络指纹变化要作废测量结果。
// 指纹回调只会在后续检查里触发，因此这里用可变引用破掉两者之间的循环依赖。
let invalidateProbes: () => void = () => undefined;
const statusAccess = useMirrorStatus({
  autoStart: false,
  onFingerprintChange: () => invalidateProbes(),
});
const {
  enabled: statusEnabled,
  meta: statusMeta,
  recordFor: statusRecordFor,
  statusFor,
} = statusAccess;

/**
 * 同步状态的**响应式快照**。
 *
 * 为什么需要它：`useMirrorStatus` 内部用普通 Map 存记录（不是响应式数据），而推荐评分与来源
 * 列表都要读它。如果直接在 computed 里调 statusFor，`/api/mirrors` 返回之后没人通知重算，
 * 就会出现“界面上写着同步失败，却仍然被推荐”这种自相矛盾的状态。
 * 这里读一下 meta 建立依赖，状态响应一到就重算。
 */
const syncStatusSnapshot = computed(() => {
  void statusMeta.value.generatedAt;
  return new Map(mirrors.map((mirror) => [mirror.id, statusFor(mirror.id, props.ecosystem.id)]));
});

const syncRecordSnapshot = computed(() => {
  void statusMeta.value.generatedAt;
  return new Map(
    mirrors.map((mirror) => [mirror.id, statusRecordFor(mirror.id, props.ecosystem.id)]),
  );
});

const {
  viewFor: probeViewFor,
  recommendedMirrorId,
  refreshing: probeRefreshing,
  offline: probeOffline,
  lastMeasuredAt,
  lastRoundFailures,
  refresh: refreshProbes,
  revalidate: revalidateProbes,
  invalidate: invalidateProbesInternal,
} = createMirrorProbeAccess({
  getTargets: () => probeTargets,
  getFingerprint: () => statusAccess.fingerprintValue.value,
  getSyncStatus: (id) => syncStatusSnapshot.value.get(id) ?? SYNC_UNKNOWN,
  autoStart: false,
});

invalidateProbes = invalidateProbesInternal;

/** 同步状态文案：评分用状态值，展示用文案，口径集中在 lib/statusView.ts。 */
function syncFor(mirrorIdValue: string) {
  const mirror = mirrors.find((item) => item.id === mirrorIdValue);
  const record = syncRecordSnapshot.value.get(mirrorIdValue);
  const description = describeSyncStatus({
    mirrorId: mirrorIdValue,
    hasSource: mirror?.statusSource !== undefined,
    isOfficial: mirror?.kind === 'official',
    stale: statusMeta.value.stale,
    ...(record === undefined ? {} : { record }),
  });

  return {
    text: description.text,
    // 同步时间这类细节只在悬停提示里给，常驻界面上只留一句状态词。
    ...(description.detail === undefined || description.detail === '' ? {} : { detail: undefined }),
    tone: description.tone,
  };
}

/** 排名表的行：来源按耗时排序，推荐项标记出来，同步状态按生态给出。 */
const rankRows = computed<RankRow[]>(() =>
  mirrors
    .map((mirror) => ({
      mirror,
      view: probeViewFor(mirror.id),
      latency: latencyOf(probeViewFor(mirror.id)),
    }))
    .sort(
      (left, right) =>
        left.latency - right.latency || left.mirror.name.localeCompare(right.mirror.name, 'zh'),
    )
    .map(({ mirror, view }) => ({
      id: mirror.id,
      name: mirror.name,
      kindLabel: MIRROR_KIND_LABELS[mirror.kind],
      view,
      recommended: mirror.id === recommendedMirrorId.value,
      sync: syncFor(mirror.id),
    })),
);

const selectedMirror = computed(() => mirrors.find((mirror) => mirror.id === mirrorId.value));

const statusSourceNote = computed<string | undefined>(() => {
  if (!statusEnabled) {
    return undefined;
  }
  const meta = statusMeta.value;
  if (meta.fetchedAt === undefined) {
    return '本次访问没有取到同步数据（首次同步可能正在进行），同步状态按“未知”展示。';
  }
  const available = meta.sources.filter((source) => source.ok).length;
  const updated = new Date(meta.fetchedAt).toLocaleString('zh-CN', { hour12: false });
  const freshness = meta.stale ? '，可能已过期' : '';
  return `同步数据更新于 ${updated}，来源 ${available}/${meta.sources.length} 可用${freshness}`;
});

// 推荐结果在探测过程中会变；一旦用户手动点过来源，guideParams 自身会忽略后续推荐。
watch(recommendedMirrorId, (value) => applyRecommendation(value), { immediate: true });

const lastMeasuredLabel = computed<string | undefined>(() => {
  const at = lastMeasuredAt.value;
  return at === undefined ? undefined : new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
});

const ecosystemSources = computed(() => props.ecosystem.sources);

const verification = computed(() => (guide.value.ok ? guide.value.guide.verification : undefined));
const restore = computed(() => (guide.value.ok ? guide.value.guide.restore : undefined));
const placeholders = computed(() => (guide.value.ok ? guide.value.guide.placeholders : []));
const mirrorInfo = computed(() => (guide.value.ok ? guide.value.guide.mirror : undefined));

/**
 * “官方默认 → 镜像配置”对照（仅 apt / docker-ce，理由见 lib/configBaseline.ts）。
 * 直接用当前渲染出的那份文件内容，保证卡片对照的就是用户正在看的那一份。
 */
const configDiffView = computed(() => {
  const file = guide.value.ok ? guide.value.guide.configFile : undefined;
  if (!file) {
    return undefined;
  }
  return buildConfigDiffView({
    ecosystem: props.ecosystem,
    mirrors,
    os: os.value,
    shell: shell.value,
    ...(version.value === undefined ? {} : { version: version.value }),
    content: file.content,
    path: file.path,
  });
});

/**
 * 配置方式的编号按实际存在的方式生成：少了哪一种，编号也不会出现空位。
 */
const configureBlocks = computed(() => {
  if (!guide.value.ok) {
    return [];
  }
  const blocks: Array<
    | { id: string; title: string; kind: 'command'; label: string; command: string; note?: string }
    | { id: string; title: string; kind: 'file'; file: GeneratedConfigFile }
  > = [];

  for (const command of guide.value.guide.commands) {
    blocks.push({
      id: command.mode,
      title: GUIDE_MODE_LABELS[command.mode],
      kind: 'command',
      label: command.label,
      command: command.command,
      ...(command.note === undefined ? {} : { note: command.note }),
    });
  }

  const file = guide.value.guide.configFile;
  if (file) {
    blocks.push({ id: 'configFile', title: GUIDE_MODE_LABELS.configFile, kind: 'file', file });
  }

  return blocks;
});

// ── 进度（本地记录，不做门禁） ───────────────────────────────────────────
const progress = createProgressStore();
const done = ref<GuideAction[]>(progress.read(props.ecosystem.id));

function toggleAction(action: GuideAction, value: boolean): void {
  done.value = progress.toggle(props.ecosystem.id, action, value);
}

// ── 目录栏：当前章节高亮 + 滚动跳转 ─────────────────────────────────────
const visibleSections = computed(() =>
  GUIDE_SECTIONS.filter((section) => section.id !== 'faq' || troubleshooting.length > 0),
);

const activeSection = ref<GuideSectionId>('source');
let observer: IntersectionObserver | undefined;

/**
 * 进页面的顺序：先问网络指纹（一次同源请求，本机后端），再决定测谁。
 *
 * 为什么要等指纹：缓存里的耗时随它一起写入，指纹变了就说明那些数字是别的网络下测的，
 * 必须先作废重测。等它的代价只有一次本机请求，不等就会把别处测的值当成本网络的。
 * 同步状态（/api/mirrors）不阻塞测速，放在后面并行拉。
 */
onMounted(() => {
  void startGuide();
});

async function startGuide(): Promise<void> {
  // 等指纹有上限（见 waitForFingerprint）：后端慢或挂掉时最多等一秒就开测，不让页面空转。
  await waitForFingerprint(statusAccess);
  // revalidate 而不是 refresh：缓存新鲜的来源一个请求都不发，只补过期的。
  revalidateProbes();
  void statusAccess.refresh(true);
}

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    return;
  }
  // rootMargin 把“中间偏上”那条带当作当前章节，避免标题刚露头就抢高亮。
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeSection.value = entry.target.id.replace('doc-', '') as GuideSectionId;
        }
      }
    },
    { rootMargin: '-25% 0px -65% 0px' },
  );
  for (const section of visibleSections.value) {
    const element = document.getElementById(`doc-${section.id}`);
    if (element) {
      observer.observe(element);
    }
  }
});

onUnmounted(() => {
  observer?.disconnect();
});

/**
 * 章节跳转用脚本滚动而不是锚点链接：本站是 hash 路由，`href="#doc-verify"` 会被路由器
 * 当成一条新路由（跑到 404 页）。滚动行为跟随系统的“减少动效”设置。
 */
function jumpTo(id: GuideSectionId): void {
  const element = document.getElementById(`doc-${id}`);
  if (!element) {
    return;
  }
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
</script>

<template>
  <div class="shell-inner">
    <div class="params">
      <div class="param">
        <span class="param-label">系统</span>
        <div class="seg" role="group" aria-label="操作系统">
          <button
            v-for="platform in platforms"
            :key="platform.os"
            type="button"
            :aria-pressed="os === platform.os"
            @click="setOs(platform.os)"
          >
            {{
              platform.os === 'windows' ? 'Windows' : platform.os === 'macos' ? 'macOS' : 'Linux'
            }}
          </button>
        </div>
      </div>

      <div class="param">
        <span class="param-label">终端</span>
        <div class="seg" role="group" aria-label="终端">
          <button
            v-for="item in shells"
            :key="item"
            type="button"
            :aria-pressed="shell === item"
            @click="setShell(item)"
          >
            {{
              item === 'powershell'
                ? 'PowerShell'
                : item === 'cmd'
                  ? 'CMD'
                  : item === 'zsh'
                    ? 'Zsh'
                    : 'Bash'
            }}
          </button>
        </div>
      </div>

      <div v-if="versions.length > 0" class="param">
        <span class="param-label">版本</span>
        <div class="seg" role="group" aria-label="发行版版本">
          <button
            v-for="item in versions"
            :key="item"
            type="button"
            :aria-pressed="version === item"
            @click="setVersion(item)"
          >
            {{ item }}
          </button>
        </div>
      </div>

      <div class="param param-source">
        <span class="param-label">来源</span>
        <a class="param-value" href="#doc-source" @click.prevent="jumpTo('source')">
          {{ selectedMirror?.name ?? '选择来源' }}
        </a>
      </div>

      <div class="params-end">
        <button
          class="btn-quiet"
          type="button"
          title="重新测速"
          :disabled="probeOffline"
          @click="refreshProbes()"
        >
          <RotateCw :size="14" :class="{ 'icon-spin': probeRefreshing }" aria-hidden="true" />
          <span>{{ lastMeasuredLabel ? `测速于 ${lastMeasuredLabel}` : '测速' }}</span>
        </button>
      </div>
    </div>

    <div class="docs">
      <nav class="toc" aria-label="本页目录">
        <a
          v-for="section in visibleSections"
          :key="section.id"
          href="#"
          :aria-current="activeSection === section.id ? 'true' : undefined"
          @click.prevent="jumpTo(section.id)"
        >
          <span class="toc-no num">{{
            String(GUIDE_SECTIONS.indexOf(section) + 1).padStart(2, '0')
          }}</span>
          <span>{{ section.title }}</span>
        </a>
      </nav>

      <main class="doc-body">
        <header class="doc-head">
          <h1>
            {{ ecosystem.name }}
            <span class="owner">{{ ecosystem.packageManager }}</span>
          </h1>
          <p class="lede">{{ ecosystem.description }}</p>

          <details v-if="ecosystem.prerequisites.length > 0" class="doc-facts">
            <summary>开始前确认（{{ ecosystem.prerequisites.length }} 条）</summary>
            <ul class="checklist">
              <li v-for="(item, index) in ecosystem.prerequisites" :key="item">
                <input :id="`prereq-${ecosystem.id}-${index}`" type="checkbox" />
                <label :for="`prereq-${ecosystem.id}-${index}`">{{ item }}</label>
              </li>
            </ul>
            <p class="doc-sources">
              <span>官方文档：</span>
              <a
                v-for="source in ecosystemSources"
                :key="source.url"
                :href="source.url"
                target="_blank"
                rel="noreferrer noopener"
                >{{ source.url }}</a
              >
            </p>
          </details>
        </header>

        <!-- 01 选择来源 -->
        <section id="doc-source" class="sec">
          <h2><span class="toc-no num">01</span>选择来源</h2>

          <RankTable
            :rows="rankRows"
            :head="true"
            :axis="true"
            :interactive="true"
            @select="setMirror"
          />

          <p v-if="lastRoundFailures > 0" class="note">
            本次测速没有成功，仍在显示上次成功的结果。
          </p>

          <p v-if="statusSourceNote" class="note">{{ statusSourceNote }}</p>

          <p v-if="probeOffline" class="note" data-tone="warn">
            浏览器报告当前处于离线状态，已停止测速；联网后可以点右上角的测速。
          </p>

          <p
            v-if="mirrorPinned && recommendedMirrorId && recommendedMirrorId !== mirrorId"
            class="note"
          >
            你已经手动选过来源，新的测速结果不会自动替换它。
          </p>

          <p v-if="selectedMirror?.kind === 'official'" class="note">
            官方源就是默认行为，通常不需要换源；要清掉已有的镜像配置，用第 04 节的还原命令。
          </p>

          <p class="hint">
            数字是响应耗时估算，不是下载速度。
            <RouterLink :to="{ name: 'help', params: { id: 'probe' } }">口径见帮助</RouterLink>
          </p>
        </section>

        <!-- 02 配置命令 -->
        <section id="doc-configure" class="sec">
          <h2><span class="toc-no num">02</span>配置命令</h2>

          <p v-if="!guide.ok" class="note" data-tone="bad" role="alert">{{ guide.message }}</p>

          <template v-else>
            <div v-for="(block, index) in configureBlocks" :key="block.id" class="block">
              <p class="block-head">
                <span class="block-title">
                  {{ String(index + 1).padStart(2, '0') }} {{ block.title }}
                </span>
                <span v-if="block.kind === 'file'" class="block-meta num">{{
                  block.file.path
                }}</span>
              </p>

              <CommandBlock
                v-if="block.kind === 'command'"
                :command="block.command"
                :label="block.label"
                :note="block.note"
              />

              <template v-else>
                <CommandBlock :command="block.file.content" label="文件内容" />
                <ConfigDiff
                  v-if="configDiffView"
                  :baseline-name="configDiffView.baselineName"
                  :mirror-name="mirrorInfo?.name ?? '所选来源'"
                  :diff="configDiffView.diff"
                />
                <dl class="kv wide">
                  <div>
                    <dt>写入前请注意</dt>
                    <dd>{{ block.file.instructions }}</dd>
                  </div>
                  <div v-if="block.file.backup">
                    <dt>备份建议</dt>
                    <dd>{{ block.file.backup }}</dd>
                  </div>
                </dl>
              </template>
            </div>

            <p v-if="placeholders.length > 0" class="note">
              复制后请把 {{ placeholders.join('、') }} 替换成你要安装的包名；占位符不会自动展开。
            </p>

            <p v-if="mirrorInfo" class="hint">
              当前来源 {{ mirrorInfo.name
              }}<template v-if="versionLabel">，适用系统 {{ versionLabel }}</template
              ><template v-if="!mirrorInfo.supportsPublish">，该来源不支持发布包</template>。
            </p>

            <label class="check-row">
              <input
                type="checkbox"
                :checked="done.includes('configure')"
                @change="toggleAction('configure', ($event.target as HTMLInputElement).checked)"
              />
              <span>我已完成这一节（只记录在本机，不影响页面内容）</span>
            </label>
          </template>
        </section>

        <!-- 03 验证配置 -->
        <section id="doc-verify" class="sec">
          <h2><span class="toc-no num">03</span>验证配置</h2>

          <template v-if="verification">
            <CommandBlock :command="verification.command" label="在你的终端执行" />
            <p class="expect">{{ verification.expected }}</p>
            <p v-if="verification.note" class="hint">{{ verification.note }}</p>

            <label class="check-row">
              <input
                type="checkbox"
                :checked="done.includes('verify')"
                @change="toggleAction('verify', ($event.target as HTMLInputElement).checked)"
              />
              <span>我已经在终端里验证过</span>
            </label>
          </template>

          <p v-else class="note" data-tone="bad" role="alert">
            当前选择没有可用的验证命令，请把上面的系统与终端改成数据支持的组合。
          </p>
        </section>

        <!-- 04 恢复与还原 -->
        <section id="doc-restore" class="sec">
          <h2><span class="toc-no num">04</span>恢复与还原</h2>

          <template v-if="restore">
            <CommandBlock :command="restore.command" label="在你的终端执行" />
            <p class="expect">{{ restore.expected }}</p>
            <p v-if="restore.note" class="hint">{{ restore.note }}</p>

            <p class="note">
              恢复官方默认源不等于还原你原来的配置；之前改过这一项的话，用上一节提示的备份文件手动恢复。
            </p>

            <label class="check-row">
              <input
                type="checkbox"
                :checked="done.includes('restore')"
                @change="toggleAction('restore', ($event.target as HTMLInputElement).checked)"
              />
              <span>我知道怎么还原到官方默认源</span>
            </label>
          </template>

          <p v-else class="note" data-tone="bad" role="alert">当前选择没有可用的还原命令。</p>
        </section>

        <!-- 05 常见问题 -->
        <section v-if="troubleshooting.length > 0" id="doc-faq" class="sec">
          <h2><span class="toc-no num">05</span>常见问题</h2>
          <TroubleshootingList :entries="troubleshooting" />
        </section>

        <p v-if="detectionNote" class="hint">{{ detectionNote }}</p>

        <p class="footline">
          <span>数字是响应耗时估算，不是下载速度。</span>
          <span v-if="mirrorInfo" class="num">数据核对于 {{ mirrorInfo.checkedAt }}</span>
        </p>
      </main>
    </div>
  </div>
</template>
