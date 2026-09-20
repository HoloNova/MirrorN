<script setup lang="ts">
import { ArrowLeft, CircleAlert, Info, RotateCw, ShieldCheck } from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import type { Ecosystem, Mirror } from '@mirrorn/shared';
import { SYNC_UNKNOWN } from '@mirrorn/shared/sync';
import { GUIDE_MODE_LABELS, type GeneratedConfigFile } from '@mirrorn/shared/generators';

import CommandBlock from './CommandBlock.vue';
import ProbeReadout from './ProbeReadout.vue';
import TroubleshootingList from './TroubleshootingList.vue';
import { createMirrorProbeAccess, toProbeTargets } from '../composables/useMirrorProbes';
import { useMirrorStatus } from '../composables/useMirrorStatus';
import { getTroubleshooting, listEcosystemMirrors } from '../lib/ecosystems';
import { createGuideParams, GUIDE_SECTIONS, type GuideSectionId } from '../lib/guideParams';
import { createProgressStore, GUIDE_ACTIONS, type GuideAction } from '../lib/guideProgress';
import { presentReadout } from '../lib/readout';
import { describeSyncStatus } from '../lib/statusView';

/**
 * 生态页的文档形态。
 *
 * 与旧向导的关键区别：**所有章节一次渲染**，参数条只负责筛选这一页显示哪些命令。
 * 内容不因为"没点下一步"而消失；进度勾选只是给新手的定位锚点，不做门禁。
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

// 候选只包含数据里声明了探针的来源；其余来源显示"无法测量"。
// 用 createMirrorProbeAccess 而不是 useMirrorProbes：测速初始化失败时降级为"无法测量"，
// 不让整页打不开（失败原因见浏览器控制台）。
const probeTargets = toProbeTargets(mirrors);

// 先建状态接入，再建测速接入：同步状态参与推荐评分，而状态里的网络指纹变化要作废测量结果。
// 指纹回调只会在后续检查里触发，因此这里用可变引用破掉两者之间的循环依赖。
let invalidateProbes: () => void = () => undefined;
const statusAccess = useMirrorStatus({ onFingerprintChange: () => invalidateProbes() });
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
 * 就会出现“界面上写着同步失败，却仍然被推荐”这种自相矛盾的状态（旧向导里也潜伏着这个竞态：
 * 只有当另一次探测结果恰好晚于状态响应到达时，结果才是对的）。
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
  refresh: refreshProbes,
  invalidate: invalidateProbesInternal,
} = createMirrorProbeAccess({
  getTargets: () => probeTargets,
  getSyncStatus: (id) => syncStatusSnapshot.value.get(id) ?? SYNC_UNKNOWN,
});

invalidateProbes = invalidateProbesInternal;

/** 同步状态文案：评分用状态值，展示用文案，口径集中在 lib/statusView.ts。 */
function syncFor(mirror: Mirror) {
  const record = syncRecordSnapshot.value.get(mirror.id);
  return describeSyncStatus({
    mirrorId: mirror.id,
    hasSource: mirror.statusSource !== undefined,
    isOfficial: mirror.kind === 'official',
    stale: statusMeta.value.stale,
    ...(record === undefined ? {} : { record }),
  });
}

const statusSourceNote = computed<string | undefined>(() => {
  if (!statusEnabled) {
    return undefined;
  }
  const meta = statusMeta.value;
  if (meta.fetchedAt === undefined) {
    return '已连接的运行时没有可用同步数据（首次同步可能正在进行），下面按“未知”展示。';
  }
  const available = meta.sources.filter((source) => source.ok).length;
  const updated = new Date(meta.fetchedAt).toLocaleString('zh-CN', { hour12: false });
  const freshness = meta.stale ? '，数据可能已过期' : '';
  return `同步状态来自后端聚合，更新于 ${updated}（来源 ${available}/${meta.sources.length} 个可用${freshness}）。`;
});

// 推荐结果在探测过程中会变；一旦用户手动点过来源，guideParams 自身会忽略后续推荐。
watch(recommendedMirrorId, (value) => applyRecommendation(value), { immediate: true });

const lastMeasuredLabel = computed<string | undefined>(() => {
  const at = lastMeasuredAt.value;
  return at === undefined ? undefined : new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
});

const KIND_LABELS: Record<string, string> = {
  official: '官方',
  university: '高校',
  commercial: '商业',
  community: '社区',
};

function repositoryUrlFor(id: string): string {
  return props.ecosystem.supports.find((support) => support.mirrorId === id)?.repositoryUrl ?? '';
}

const selectedMirrorKind = computed(
  () => mirrors.find((mirror) => mirror.id === mirrorId.value)?.kind ?? '',
);

const ecosystemSources = computed(() => props.ecosystem.sources);

/** 读数的补充说明：正常测到的 cors 结果不重复“HTTP 200”这类噪声，其余都写明原因。 */
function probeDetailFor(id: string): string | undefined {
  const view = probeViewFor(id);
  const readout = presentReadout(view);
  if (readout.state === 'measured' && !view.stale && view.result?.opaque === false) {
    return undefined;
  }
  return readout.detail;
}

const verification = computed(() => (guide.value.ok ? guide.value.guide.verification : undefined));
const restore = computed(() => (guide.value.ok ? guide.value.guide.restore : undefined));
const placeholders = computed(() => (guide.value.ok ? guide.value.guide.placeholders : []));
const mirrorInfo = computed(() => (guide.value.ok ? guide.value.guide.mirror : undefined));

/**
 * 配置方式不做成选项卡：临时、全局、配置文件三种方式一次全部列出，
 * 编号按实际存在的方式生成（少了哪一种，编号也不会出现空位）。
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

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    return;
  }
  // rootMargin 把"中间偏上"那条带当作当前章节，避免标题刚露头就抢高亮。
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
 * 当成一条新路由（跑到 404 页）。滚动行为跟随系统的"减少动效"设置。
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
    <header class="doc-head">
      <div class="crumbs">
        <RouterLink :to="{ name: 'home' }">
          <ArrowLeft :size="14" aria-hidden="true" />
          <span>返回目录</span>
        </RouterLink>
      </div>

      <div class="doc-title-row">
        <h1>{{ ecosystem.name }}</h1>
        <span v-if="ecosystemSources[0]" class="doc-meta">
          数据核对于 {{ ecosystemSources[0].checkedAt }}
        </span>
      </div>
      <p class="doc-lede">{{ ecosystem.description }}</p>

      <div class="subsection">
        <span class="subsection-title">开始前确认</span>
        <ul class="checklist">
          <li v-for="(item, index) in ecosystem.prerequisites" :key="item">
            <input :id="`prereq-${ecosystem.id}-${index}`" type="checkbox" />
            <label :for="`prereq-${ecosystem.id}-${index}`">{{ item }}</label>
          </li>
        </ul>
        <p class="subsection-note source-list">
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
      </div>
    </header>

    <div class="params">
      <div class="params-group">
        <span class="params-label">系统</span>
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

      <div class="params-group">
        <span class="params-label">终端</span>
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

      <div v-if="versions.length > 0" class="params-group">
        <span class="params-label">版本</span>
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

      <div class="params-end">
        <button
          class="btn btn-quiet"
          type="button"
          title="重新测量各来源的响应耗时"
          :disabled="probeOffline"
          @click="refreshProbes()"
        >
          <RotateCw :size="14" :class="{ 'icon-spin': probeRefreshing }" aria-hidden="true" />
          <span>{{ lastMeasuredLabel ? `测量于 ${lastMeasuredLabel}` : '测量' }}</span>
        </button>
        <a class="mirror-url" href="#doc-source" @click.prevent="jumpTo('source')">
          {{ mirrorInfo?.name ?? '选择来源' }}
        </a>
        <ProbeReadout
          :view="probeViewFor(mirrorId)"
          :recommended="mirrorId === recommendedMirrorId"
        />
      </div>
    </div>

    <div class="doc-body">
      <nav class="toc" aria-label="本页目录">
        <p class="toc-title">本页目录</p>
        <ul class="toc-list">
          <li v-for="section in visibleSections" :key="section.id">
            <a
              class="toc-link"
              href="#"
              :aria-current="activeSection === section.id ? 'true' : undefined"
              @click.prevent="jumpTo(section.id)"
            >
              <span class="toc-link-num">{{ GUIDE_SECTIONS.indexOf(section) + 1 }}</span>
              <span>{{ section.title }}</span>
            </a>
          </li>
        </ul>
        <div class="toc-progress">
          已完成 <span class="num">{{ done.length }}</span> / {{ GUIDE_ACTIONS.length }} 个动作
          <span class="progress-ticks" aria-hidden="true">
            <span
              v-for="action in GUIDE_ACTIONS"
              :key="action"
              class="progress-tick"
              :data-done="done.includes(action)"
            />
          </span>
        </div>
      </nav>

      <div class="doc-main">
        <!-- 1 选择来源 -->
        <section id="doc-source" class="section is-first">
          <div class="section-head">
            <span class="section-num">1</span>
            <h2>选择来源</h2>
          </div>
          <div class="section-body is-wide">
            <div class="mirror-list">
              <button
                v-for="mirror in mirrors"
                :key="mirror.id"
                class="mirror-option"
                type="button"
                :aria-pressed="mirrorId === mirror.id"
                @click="setMirror(mirror.id)"
              >
                <span class="mirror-top">
                  <span class="mirror-name">{{ mirror.name }}</span>
                  <span class="kind">{{ KIND_LABELS[mirror.kind] ?? mirror.kind }}</span>
                  <span class="mirror-top-end">
                    <ProbeReadout
                      :view="probeViewFor(mirror.id)"
                      :recommended="mirror.id === recommendedMirrorId"
                    />
                  </span>
                </span>
                <code class="mirror-url">{{ repositoryUrlFor(mirror.id) }}</code>
                <span class="mirror-foot">
                  <span class="status" :data-tone="syncFor(mirror).tone">
                    <span class="status-dot" aria-hidden="true" />
                    <span class="status-text">{{ syncFor(mirror).text }}</span>
                  </span>
                  <span v-if="syncFor(mirror).detail" class="status-detail">
                    {{ syncFor(mirror).detail }}
                  </span>
                  <span v-if="probeDetailFor(mirror.id)" class="status-detail probe-detail">
                    {{ probeDetailFor(mirror.id) }}
                  </span>
                </span>
              </button>
            </div>

            <p v-if="statusSourceNote" class="note" data-tone="info">
              <Info :size="14" aria-hidden="true" />
              <span>{{ statusSourceNote }}</span>
            </p>

            <p v-if="probeOffline" class="note" data-tone="warn">
              <Info :size="14" aria-hidden="true" />
              <span>浏览器报告当前处于离线状态，已停止测量；联网后可以点右上角的测量。</span>
            </p>

            <p
              v-if="mirrorPinned && recommendedMirrorId && recommendedMirrorId !== mirrorId"
              class="note"
              data-tone="info"
            >
              <Info :size="14" aria-hidden="true" />
              <span
                >你已经手动选过来源，新的测量结果不会自动替换它；要改用推荐来源，点上面那一项即可。</span
              >
            </p>

            <p v-if="selectedMirrorKind === 'official'" class="note" data-tone="info">
              <Info :size="14" aria-hidden="true" />
              <span
                >官方源就是默认行为，通常不需要换源。如果你想清除已有的镜像配置，请用第 4
                节的还原命令。</span
              >
            </p>

            <p class="note">
              <Info :size="14" aria-hidden="true" />
              <span
                >测量由你的浏览器直接请求来源站上审核过的小资源，得到的是响应耗时估算（受
                DNS、连接复用与缓存影响），
                不代表下载速度，也不能证明仓库内容正常。只有数据里声明了探针的来源会测量。</span
              >
            </p>
          </div>
        </section>

        <!-- 2 配置命令 -->
        <section id="doc-configure" class="section">
          <div class="section-head">
            <span class="section-num">2</span>
            <h2>配置命令</h2>
          </div>
          <div class="section-body is-wide">
            <p v-if="!guide.ok" class="note" data-tone="bad" role="alert">
              <CircleAlert :size="14" aria-hidden="true" />
              <span>{{ guide.message }}</span>
            </p>

            <template v-else>
              <div v-for="(block, index) in configureBlocks" :key="block.id" class="subsection">
                <div class="subsection-head">
                  <span class="subsection-title">2.{{ index + 1 }} {{ block.title }}</span>
                  <span v-if="block.kind === 'file'" class="subsection-note">
                    文件路径 <code>{{ block.file.path }}</code>
                  </span>
                </div>

                <CommandBlock
                  v-if="block.kind === 'command'"
                  :command="block.command"
                  :label="block.label"
                  :note="block.note"
                />

                <template v-else>
                  <CommandBlock :command="block.file.content" label="文件内容" />
                  <dl class="kv">
                    <div>
                      <dt>配置文件路径</dt>
                      <dd>
                        <code>{{ block.file.path }}</code>
                      </dd>
                    </div>
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

              <p v-if="placeholders.length > 0" class="note" data-tone="info">
                <Info :size="14" aria-hidden="true" />
                <span
                  >复制后请把
                  {{ placeholders.join('、') }} 替换成你要安装的包名；占位符不会自动展开。</span
                >
              </p>

              <p v-if="mirrorInfo" class="subsection-note">
                当前来源：{{ mirrorInfo.name }} · 数据核对于 {{ mirrorInfo.checkedAt }}
                <template v-if="versionLabel"> · 适用系统：{{ versionLabel }} </template>
                <template v-if="!mirrorInfo.supportsPublish">
                  · 该来源不支持发布包，仅用于下载依赖
                </template>
              </p>

              <label class="check-row">
                <input
                  type="checkbox"
                  :checked="done.includes('configure')"
                  @change="toggleAction('configure', ($event.target as HTMLInputElement).checked)"
                />
                <span>我已完成这一节的命令（只记录在本机，不影响页面内容）</span>
              </label>
            </template>
          </div>
        </section>

        <!-- 3 验证配置 -->
        <section id="doc-verify" class="section">
          <div class="section-head">
            <span class="section-num">3</span>
            <h2>验证配置</h2>
          </div>
          <div class="section-body is-wide">
            <p class="subsection-note">
              下面这条命令需要你自己在终端里执行。页面不会运行命令，也不会读取你的终端输出。
            </p>

            <template v-if="verification">
              <CommandBlock :command="verification.command" label="在你的终端执行" />
              <div class="expect">
                <span class="expect-label">如何判断成功</span>
                <p>{{ verification.expected }}</p>
                <p v-if="verification.note" class="subsection-note">{{ verification.note }}</p>
              </div>

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
              <CircleAlert :size="14" aria-hidden="true" />
              <span>当前选择没有可用的验证命令，请把上面的系统与终端改成数据支持的组合。</span>
            </p>
          </div>
        </section>

        <!-- 4 恢复与还原 -->
        <section id="doc-restore" class="section">
          <div class="section-head">
            <span class="section-num">4</span>
            <h2>恢复与还原</h2>
          </div>
          <div class="section-body is-wide">
            <template v-if="restore">
              <CommandBlock :command="restore.command" label="在你的终端执行" />
              <div class="expect">
                <span class="expect-label">执行后会发生什么</span>
                <p>{{ restore.expected }}</p>
                <p v-if="restore.note" class="subsection-note">{{ restore.note }}</p>
              </div>

              <p class="note" data-tone="ok">
                <ShieldCheck :size="14" aria-hidden="true" />
                <span
                  >恢复官方默认源不等于还原你原来的配置。如果之前改过这一项，请用上一节提示的备份文件手动恢复。</span
                >
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

            <p v-else class="note" data-tone="bad" role="alert">
              <CircleAlert :size="14" aria-hidden="true" />
              <span>当前选择没有可用的还原命令。</span>
            </p>
          </div>
        </section>

        <!-- 5 常见问题 -->
        <section v-if="troubleshooting.length > 0" id="doc-faq" class="section">
          <div class="section-head">
            <span class="section-num">5</span>
            <h2>常见问题</h2>
          </div>
          <div class="section-body is-wide">
            <TroubleshootingList :entries="troubleshooting" />
          </div>
        </section>

        <p v-if="detectionNote" class="note" data-tone="info">
          <Info :size="14" aria-hidden="true" />
          <span>{{ detectionNote }}</span>
        </p>
      </div>
    </div>
  </div>
</template>
