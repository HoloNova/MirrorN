<script setup lang="ts">
import { ArrowLeft, CircleAlert, Info, RotateCw, ShieldCheck } from '@lucide/vue';
import { computed, watch } from 'vue';
import { RouterLink } from 'vue-router';

import type { Ecosystem, Mirror } from '@mirrorn/shared';
import {
  GUIDE_MODE_LABELS,
  OPERATING_SYSTEM_LABELS,
  SHELL_LABELS,
  type GuideMode,
} from '@mirrorn/shared/generators';

import CommandBlock from './CommandBlock.vue';
import ProbeBadge from './ProbeBadge.vue';
import TroubleshootingList from './TroubleshootingList.vue';
import { createMirrorProbeAccess, toProbeTargets } from '../composables/useMirrorProbes';
import { useMirrorStatus } from '../composables/useMirrorStatus';
import { getTroubleshooting, listEcosystemMirrors } from '../lib/ecosystems';
import { describeSyncStatus } from '../lib/statusView';
import { createGuideWizard, WIZARD_STEPS } from '../lib/wizard';

const props = defineProps<{ ecosystem: Ecosystem }>();

const wizard = createGuideWizard(props.ecosystem);
const {
  step,
  os,
  shell,
  version,
  mirrorId,
  mode,
  platforms,
  shells,
  versions,
  versionLabel,
  guide,
  modes,
  detectionNote,
  canProceed,
  mirrorPinned,
  setOs,
  setShell,
  setVersion,
  setMirror,
  setMode,
  goToStep,
  next,
  previous,
  applyRecommendation,
} = wizard;

const mirrors = listEcosystemMirrors(props.ecosystem);
const troubleshooting = getTroubleshooting(props.ecosystem.id);

// 候选只包含数据里声明了探针的来源；其余来源在界面上显示“无法测量”。
// 用 createMirrorProbeAccess 而不是 useMirrorProbes：测速初始化失败时降级为“无法测量”，
// 不让向导页因为增强功能的问题打不开（失败原因见浏览器控制台）。
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
  getSyncStatus: (mirrorId) => statusFor(mirrorId, props.ecosystem.id),
});

invalidateProbes = invalidateProbesInternal;

/** 同步状态文案：评分用状态值，展示用文案，口径集中在 lib/statusView.ts。 */
function syncFor(mirror: Mirror) {
  const record = statusRecordFor(mirror.id, props.ecosystem.id);
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

// 推荐结果在探测过程中会变；一旦用户手动点过来源，向导自身会忽略后续推荐。
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

// 只保留 http(s) 链接作为可点击入口；数据校验已经限制为 HTTPS。
const ecosystemSources = computed(() => props.ecosystem.sources);

const activeCommand = computed(() => {
  if (!guide.value.ok) {
    return undefined;
  }
  return guide.value.guide.commands.find((command) => command.mode === mode.value);
});

const configFile = computed(() => (guide.value.ok ? guide.value.guide.configFile : undefined));
const verification = computed(() => (guide.value.ok ? guide.value.guide.verification : undefined));
const restore = computed(() => (guide.value.ok ? guide.value.guide.restore : undefined));
const placeholders = computed(() => (guide.value.ok ? guide.value.guide.placeholders : []));
const mirrorInfo = computed(() => (guide.value.ok ? guide.value.guide.mirror : undefined));

function modeLabel(value: GuideMode): string {
  return GUIDE_MODE_LABELS[value];
}
</script>

<template>
  <article class="wizard">
    <header class="page-head">
      <RouterLink class="back-link" :to="{ name: 'home' }">
        <ArrowLeft :size="14" aria-hidden="true" />
        <span>返回目录</span>
      </RouterLink>
      <div class="page-title-row">
        <div>
          <p class="eyebrow">{{ ecosystem.packageManager }}</p>
          <h1>{{ ecosystem.name }}</h1>
        </div>
        <span class="count-label">{{ ecosystem.supports.length }} 个来源</span>
      </div>
      <p class="hero-copy">{{ ecosystem.description }}</p>
    </header>

    <section class="panel prerequisites" aria-labelledby="prerequisites-title">
      <h2 id="prerequisites-title">开始前请确认</h2>
      <p class="panel-hint">本向导不会安装下列工具，也不会读取或修改你的电脑配置。</p>
      <ul>
        <li v-for="item in ecosystem.prerequisites" :key="item">{{ item }}</li>
      </ul>

      <div class="source-links">
        <span class="source-links-label">数据来源与官方文档</span>
        <ul>
          <li v-for="source in ecosystemSources" :key="source.url">
            <a :href="source.url" target="_blank" rel="noreferrer noopener">{{ source.url }}</a>
            <span v-if="source.note" class="source-note">{{ source.note }}</span>
          </li>
        </ul>
      </div>
    </section>

    <nav aria-label="配置步骤">
      <ol class="step-indicator">
        <li v-for="item in WIZARD_STEPS" :key="item.id">
          <button
            type="button"
            :class="{ 'is-current': step === item.id, 'is-done': step > item.id }"
            :disabled="item.id > step"
            :aria-current="step === item.id ? 'step' : undefined"
            @click="goToStep(item.id)"
          >
            <span class="step-number">{{ item.id }}</span>
            <span class="step-title">{{ item.title }}</span>
          </button>
        </li>
      </ol>
    </nav>

    <section v-if="step === 1" class="panel" aria-labelledby="step1-title">
      <h2 id="step1-title">步骤 1 · 选择系统与终端</h2>
      <p class="panel-hint">浏览器的检测结果只作为初始值，请按实际情况修改。</p>

      <h3>操作系统</h3>
      <div class="option-grid">
        <button
          v-for="platform in platforms"
          :key="platform.os"
          type="button"
          :aria-pressed="os === platform.os"
          :class="{ 'is-active': os === platform.os }"
          @click="setOs(platform.os)"
        >
          <span class="option-title">{{ OPERATING_SYSTEM_LABELS[platform.os] }}</span>
          <span class="option-meta">{{ platform.shells.length }} 种终端</span>
        </button>
      </div>

      <h3>终端</h3>
      <div class="option-grid compact">
        <button
          v-for="item in shells"
          :key="item"
          type="button"
          :aria-pressed="shell === item"
          :class="{ 'is-active': shell === item }"
          @click="setShell(item)"
        >
          <span class="option-title">{{ SHELL_LABELS[item] }}</span>
        </button>
      </div>

      <template v-if="versions.length > 0">
        <h3>发行版版本</h3>
        <div class="option-grid compact">
          <button
            v-for="item in versions"
            :key="item"
            type="button"
            :aria-pressed="version === item"
            :class="{ 'is-active': version === item }"
            @click="setVersion(item)"
          >
            <span class="option-title">Ubuntu {{ item }}</span>
          </button>
        </div>
        <p class="panel-note">
          <Info :size="14" aria-hidden="true" />
          <span
            >命令与配置文件格式随版本变化（24.04 用 deb822，22.04/20.04 用
            sources.list）。本向导只覆盖上面列出的 LTS
            版本；其它发行版或架构请勿套用本页命令，请看页面底部的官方文档。</span
          >
        </p>
      </template>

      <p v-if="detectionNote" class="panel-note">
        <Info :size="14" aria-hidden="true" />
        <span>{{ detectionNote }}</span>
      </p>
    </section>

    <section v-else-if="step === 2" class="panel" aria-labelledby="step2-title">
      <h2 id="step2-title">步骤 2 · 选择镜像与配置方式</h2>
      <p class="panel-hint">来源地址全部来自仓库中的数据文件，可追溯到具体文档。</p>

      <h3>镜像来源</h3>
      <div class="probe-actions">
        <span v-if="lastMeasuredLabel" class="probe-timestamp">
          最近测量 {{ lastMeasuredLabel }}
        </span>
        <button type="button" class="icon-button" :disabled="probeOffline" @click="refreshProbes()">
          <RotateCw :size="14" :class="{ 'is-spinning': probeRefreshing }" aria-hidden="true" />
          <span>重新测量</span>
        </button>
      </div>
      <div class="mirror-list">
        <button
          v-for="mirror in mirrors"
          :key="mirror.id"
          type="button"
          :aria-pressed="mirrorId === mirror.id"
          :class="{ 'is-active': mirrorId === mirror.id }"
          @click="setMirror(mirror.id)"
        >
          <span class="mirror-head">
            <span class="option-title">{{ mirror.name }}</span>
            <span class="mirror-kind">{{ KIND_LABELS[mirror.kind] ?? mirror.kind }}</span>
          </span>
          <code class="mirror-url">{{ repositoryUrlFor(mirror.id) }}</code>
          <span class="sync-status" :data-tone="syncFor(mirror).tone">
            <span class="sync-dot" aria-hidden="true"></span>
            <span class="sync-text">{{ syncFor(mirror).text }}</span>
            <span v-if="syncFor(mirror).detail" class="sync-detail">
              {{ syncFor(mirror).detail }}
            </span>
          </span>
          <ProbeBadge
            :view="probeViewFor(mirror.id)"
            :recommended="mirror.id === recommendedMirrorId"
          />
        </button>
      </div>

      <p v-if="statusSourceNote" class="panel-note">
        <Info :size="14" aria-hidden="true" />
        <span>{{ statusSourceNote }}</span>
      </p>

      <p class="panel-hint probe-note">
        测量由你的浏览器直接请求来源站上审核过的小资源，得到的是响应耗时估算（受
        DNS、连接复用和缓存影响），
        不代表下载速度，也不能证明仓库内容正常。只有数据里声明了探针的来源会测量。
      </p>

      <p v-if="probeOffline" class="panel-note">
        <Info :size="14" aria-hidden="true" />
        <span>浏览器报告当前处于离线状态，已停止测量；联网后可以点“重新测量”。</span>
      </p>

      <p
        v-if="mirrorPinned && recommendedMirrorId && recommendedMirrorId !== mirrorId"
        class="panel-note"
      >
        <Info :size="14" aria-hidden="true" />
        <span>你已经手动选过来源，测量结果不会自动替换它；要改用推荐来源，请点上面的那一项。</span>
      </p>

      <p v-if="selectedMirrorKind === 'official'" class="panel-note">
        <Info :size="14" aria-hidden="true" />
        <span
          >官方源就是默认行为，通常不需要换源。如果你想清除已有的镜像配置，请使用步骤 4
          的还原命令。</span
        >
      </p>

      <p v-if="!guide.ok" class="panel-error" role="alert">
        <CircleAlert :size="16" aria-hidden="true" />
        <span>{{ guide.message }}</span>
      </p>

      <template v-else>
        <h3>配置方式</h3>
        <div class="mode-tabs">
          <button
            v-for="item in modes"
            :key="item"
            type="button"
            :aria-pressed="mode === item"
            :class="{ 'is-active': mode === item }"
            @click="setMode(item)"
          >
            {{ modeLabel(item) }}
          </button>
        </div>

        <CommandBlock
          v-if="activeCommand"
          :command="activeCommand.command"
          :label="activeCommand.label"
          :note="activeCommand.note"
        />

        <div v-if="mode === 'configFile' && configFile" class="config-file">
          <CommandBlock :command="configFile.content" label="文件内容" />
          <dl class="meta-list">
            <div>
              <dt>配置文件路径</dt>
              <dd>
                <code>{{ configFile.path }}</code>
              </dd>
            </div>
            <div>
              <dt>写入前请注意</dt>
              <dd>{{ configFile.instructions }}</dd>
            </div>
            <div v-if="configFile.backup">
              <dt>备份建议</dt>
              <dd>{{ configFile.backup }}</dd>
            </div>
          </dl>
        </div>

        <p v-if="placeholders.length > 0" class="panel-note">
          <Info :size="14" aria-hidden="true" />
          <span
            >复制后请把
            {{ placeholders.join('、') }} 替换成你要安装的包名；占位符不会自动展开。</span
          >
        </p>

        <p v-if="mirrorInfo" class="panel-hint">
          当前来源：{{ mirrorInfo.name }} · 数据核对于 {{ mirrorInfo.checkedAt }}
          <template v-if="versionLabel"> · 适用系统：{{ versionLabel }} </template>
          <template v-if="!mirrorInfo.supportsPublish">
            · 该来源不支持发布包，仅用于下载依赖
          </template>
        </p>
      </template>
    </section>

    <section v-else-if="step === 3" class="panel" aria-labelledby="step3-title">
      <h2 id="step3-title">步骤 3 · 验证配置</h2>
      <p class="panel-hint">
        下面这条命令需要你自己在终端里执行。页面不会运行命令，也不会读取你的终端输出。
      </p>

      <template v-if="verification">
        <CommandBlock :command="verification.command" label="在你的终端执行" />
        <div class="expectation">
          <span class="expectation-label">如何判断成功</span>
          <p>{{ verification.expected }}</p>
          <p v-if="verification.note" class="panel-hint">{{ verification.note }}</p>
        </div>
      </template>

      <p v-else class="panel-error" role="alert">
        <CircleAlert :size="16" aria-hidden="true" />
        <span>当前选择没有可用的验证命令，请先回到步骤 1 与 2 选择受支持的组合。</span>
      </p>
    </section>

    <section v-else class="panel" aria-labelledby="step4-title">
      <h2 id="step4-title">步骤 4 · 恢复与还原</h2>
      <p class="panel-hint">需要还原时使用下面的命令，同样由你在终端执行。</p>

      <template v-if="restore">
        <CommandBlock :command="restore.command" label="在你的终端执行" />
        <div class="expectation">
          <span class="expectation-label">执行后会发生什么</span>
          <p>{{ restore.expected }}</p>
          <p v-if="restore.note" class="panel-hint">{{ restore.note }}</p>
        </div>

        <p class="panel-note">
          <ShieldCheck :size="14" aria-hidden="true" />
          <span
            >恢复官方默认源不等于还原你原来的配置。如果你之前改过该配置项，请用前面提示的备份文件手动恢复。</span
          >
        </p>
      </template>

      <p v-else class="panel-error" role="alert">
        <CircleAlert :size="16" aria-hidden="true" />
        <span>当前选择没有可用的还原命令。</span>
      </p>
    </section>

    <div class="wizard-actions">
      <button v-if="step > 1" type="button" class="ghost-button" @click="previous">上一步</button>
      <button
        v-if="step < WIZARD_STEPS.length"
        type="button"
        class="primary-button"
        :disabled="!canProceed"
        @click="next"
      >
        下一步
      </button>
      <span v-else class="actions-hint">所有命令都需要你自己在终端执行。</span>
    </div>

    <TroubleshootingList :entries="troubleshooting" />
  </article>
</template>
