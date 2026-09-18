<script setup lang="ts">
import { ArrowLeft, CircleAlert, Info, ShieldCheck } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import type { Ecosystem } from '@mirrorn/shared';
import {
  GUIDE_MODE_LABELS,
  OPERATING_SYSTEM_LABELS,
  SHELL_LABELS,
  type GuideMode,
} from '@mirrorn/shared/generators';

import CommandBlock from './CommandBlock.vue';
import TroubleshootingList from './TroubleshootingList.vue';
import { getTroubleshooting, listEcosystemMirrors } from '../lib/ecosystems';
import { createGuideWizard, WIZARD_STEPS } from '../lib/wizard';

const props = defineProps<{ ecosystem: Ecosystem }>();

const wizard = createGuideWizard(props.ecosystem);
const {
  step,
  os,
  shell,
  mirrorId,
  mode,
  platforms,
  shells,
  guide,
  modes,
  detectionNote,
  canProceed,
  setOs,
  setShell,
  setMirror,
  setMode,
  goToStep,
  next,
  previous,
} = wizard;

const mirrors = listEcosystemMirrors(props.ecosystem);
const troubleshooting = getTroubleshooting(props.ecosystem.id);

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

      <p v-if="detectionNote" class="panel-note">
        <Info :size="14" aria-hidden="true" />
        <span>{{ detectionNote }}</span>
      </p>
    </section>

    <section v-else-if="step === 2" class="panel" aria-labelledby="step2-title">
      <h2 id="step2-title">步骤 2 · 选择镜像与配置方式</h2>
      <p class="panel-hint">来源地址全部来自仓库中的数据文件，可追溯到具体文档。</p>

      <h3>镜像来源</h3>
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
        </button>
      </div>

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
