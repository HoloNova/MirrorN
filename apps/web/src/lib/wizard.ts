import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

import type { Ecosystem, Mirror } from '@mirrorn/shared';
import {
  generateGuide,
  listPlatforms,
  OPERATING_SYSTEM_LABELS,
  SHELL_LABELS,
  type GuideMode,
  type GuideResult,
  type OperatingSystem,
  type PlatformOption,
  type ShellKind,
} from '@mirrorn/shared/generators';

import { listEcosystemMirrors } from './ecosystems';
import { detectOperatingSystem, detectShell } from './platform';

export const WIZARD_STEPS = [
  { id: 1, title: '系统与终端' },
  { id: 2, title: '镜像与配置方式' },
  { id: 3, title: '验证配置' },
  { id: 4, title: '恢复与还原' },
] as const;

export const LAST_STEP = WIZARD_STEPS.length;

const MODE_PREFERENCE: GuideMode[] = ['temporary', 'persistent', 'configFile'];

export interface GuideWizard {
  step: Ref<number>;
  os: Ref<OperatingSystem>;
  shell: Ref<ShellKind>;
  /** 当前平台需要选择的发行版版本；数据不按版本区分时为 undefined。 */
  version: Ref<string | undefined>;
  mirrorId: Ref<string>;
  mode: Ref<GuideMode>;
  platforms: PlatformOption[];
  shells: ComputedRef<ShellKind[]>;
  /** 当前平台可选的发行版版本（按数据顺序，通常新版本在前）。 */
  versions: ComputedRef<string[]>;
  /** 形如 “Ubuntu 24.04”的展示标签，用于说明当前生成的命令针对哪个版本。 */
  versionLabel: ComputedRef<string | undefined>;
  mirrors: ComputedRef<Mirror[]>;
  guide: ComputedRef<GuideResult>;
  modes: ComputedRef<GuideMode[]>;
  detectionNote: ComputedRef<string | undefined>;
  canProceed: ComputedRef<boolean>;
  /** 用户是否已经手动选过来源。选过之后推荐结果不再自动替换它。 */
  mirrorPinned: ComputedRef<boolean>;
  setOs: (os: OperatingSystem) => void;
  setShell: (shell: ShellKind) => void;
  setVersion: (version: string) => void;
  setMirror: (mirrorId: string) => void;
  setMode: (mode: GuideMode) => void;
  goToStep: (step: number) => void;
  next: () => void;
  previous: () => void;
  /**
   * 应用测速推荐：只在用户还没有手动选过来源、且该镜像确实在当前候选里时才生效。
   * 推荐声卡在探测过程中会变，所以这里允许反复调用；一旦用户点过任何一个来源，
   * 后续调用不再改变选择，也不会改变已经生成的命令。
   */
  applyRecommendation: (mirrorId: string | undefined) => void;
}

export interface WizardOptions {
  /** 显式传入该生态可用的镜像，便于测试和上层复用；默认取本地数据目录。 */
  mirrors?: Mirror[];
  detectedOs?: OperatingSystem;
  detectedShell?: ShellKind;
}

function isDefinedValue(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/**
 * 向导状态与生成结果的唯一来源。页面只负责渲染，所有联动规则都在这里，
 * 这样可以在不挂载组件的情况下测试「换系统后终端是否纠正」「换源后命令是否同步」。
 */
export function createGuideWizard(ecosystem: Ecosystem, options: WizardOptions = {}): GuideWizard {
  const platforms = listPlatforms(ecosystem);
  const mirrors = ref(options.mirrors ?? listEcosystemMirrors(ecosystem));
  const detectedOs = options.detectedOs ?? detectOperatingSystem();
  const os = ref<OperatingSystem>(
    platforms.some((platform) => platform.os === detectedOs)
      ? detectedOs
      : (platforms[0]?.os ?? detectedOs),
  );

  const detectedShell = options.detectedShell ?? detectShell(os.value);
  const shellsForOs = (target: OperatingSystem): ShellKind[] =>
    platforms.find((platform) => platform.os === target)?.shells ?? [];
  const osShells = () => shellsForOs(os.value);
  const shell = ref<ShellKind>(
    osShells().includes(detectedShell) ? detectedShell : (osShells()[0] ?? detectedShell),
  );

  const step = ref(1);
  const mirrorId = ref(mirrors.value[0]?.id ?? '');
  const mode = ref<GuideMode>('temporary');
  const pinned = ref(false);

  // 版本选择：仅当当前平台的数据按版本区分时才存在（例如 apt 的 Ubuntu 24.04/22.04）。
  const versionsForOs = (target: OperatingSystem): string[] =>
    platforms.find((platform) => platform.os === target)?.versions ?? [];
  const version = ref<string | undefined>(versionsForOs(os.value)[0]);

  const currentMirror = computed(
    () => mirrors.value.find((mirror) => mirror.id === mirrorId.value) ?? mirrors.value[0],
  );

  const guide = computed<GuideResult>(() => {
    if (!currentMirror.value) {
      return {
        ok: false,
        reason: 'unsupported-mirror',
        message: `${ecosystem.name} 还没有可用的来源数据。`,
      };
    }
    return generateGuide({
      ecosystem,
      mirror: currentMirror.value,
      os: os.value,
      shell: shell.value,
      ...(version.value === undefined ? {} : { version: version.value }),
    });
  });

  const modes = computed<GuideMode[]>(() => (guide.value.ok ? guide.value.guide.modes : []));

  // 换系统后，原来的终端可能不存在对应模板，必须纠正而不是留着无效组合。
  // flush: 'sync' 让状态在同一帧内一致，避免页面短暂渲染出无效组合。
  watch(
    os,
    () => {
      const available = osShells();
      if (available.length > 0 && !available.includes(shell.value)) {
        shell.value = available[0];
      }

      // 版本同样跟系统走（Linux 一整套版本、Windows/macOS 为空）。
      const versions = versionsForOs(os.value);
      if (versions.length === 0) {
        version.value = undefined;
      } else if (!versions.includes(version.value ?? '')) {
        version.value = versions[0];
      }
    },
    { flush: 'sync' },
  );

  // 某平台可能没有「临时使用」模板，此时回退到该平台实际支持的方式。
  watch(
    modes,
    (available) => {
      if (available.length > 0 && !available.includes(mode.value)) {
        mode.value =
          MODE_PREFERENCE.find((candidate) => available.includes(candidate)) ?? available[0];
      }
    },
    { immediate: true, flush: 'sync' },
  );

  const detectionNote = computed<string | undefined>(() => {
    if (options.detectedOs === undefined && options.detectedShell === undefined) {
      const detectedForOs = detectShell(os.value);
      if (!osShells().includes(detectedForOs)) {
        return `检测到 ${OPERATING_SYSTEM_LABELS[os.value]} 的默认终端是 ${SHELL_LABELS[detectedForOs]}，当前数据只有 ${osShells()
          .map((item) => SHELL_LABELS[item])
          .join('、')} 模板；本向导中的命令在这些终端里写法一致。`;
      }
    }
    return undefined;
  });

  const canProceed = computed<boolean>(() => {
    if (step.value === 1) {
      return osShells().length > 0;
    }
    if (step.value === 2) {
      return guide.value.ok && modes.value.length > 0;
    }
    return true;
  });

  const versions = computed<string[]>(() => versionsForOs(os.value));
  const versionLabel = computed<string | undefined>(() => {
    if (!guide.value.ok) {
      return undefined;
    }
    const platform = guide.value.guide.platform;
    const parts = [platform.distribution, platform.version].filter(isDefinedValue);
    return parts.length > 0 ? parts.join(' ') : undefined;
  });

  return {
    step,
    os,
    shell,
    mirrorId,
    mode,
    platforms,
    shells: computed(osShells),
    versions,
    version,
    versionLabel,
    mirrors: computed(() => mirrors.value),
    guide,
    modes,
    detectionNote,
    canProceed,
    mirrorPinned: computed(() => pinned.value),
    setOs: (value) => {
      os.value = value;
    },
    setShell: (value) => {
      shell.value = value;
    },
    setVersion: (value) => {
      version.value = value;
    },
    setMirror: (value) => {
      mirrorId.value = value;
      pinned.value = true;
    },
    setMode: (value) => {
      mode.value = value;
    },
    goToStep: (value) => {
      step.value = Math.min(Math.max(value, 1), LAST_STEP);
    },
    next: () => {
      if (canProceed.value) {
        step.value = Math.min(step.value + 1, LAST_STEP);
      }
    },
    previous: () => {
      step.value = Math.max(step.value - 1, 1);
    },
    applyRecommendation: (value) => {
      if (pinned.value || value === undefined) {
        return;
      }
      if (mirrors.value.some((mirror) => mirror.id === value)) {
        mirrorId.value = value;
      }
    },
  };
}
