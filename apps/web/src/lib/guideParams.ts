import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

import type { Ecosystem, Mirror } from '@mirrorn/shared';
import {
  generateGuide,
  listPlatforms,
  OPERATING_SYSTEM_LABELS,
  SHELL_LABELS,
  type GuideResult,
  type OperatingSystem,
  type PlatformOption,
  type ShellKind,
} from '@mirrorn/shared/generators';

import { listEcosystemMirrors } from './ecosystems';
import { detectOperatingSystem, detectShell } from './platform';

/**
 * 文档形态下的"参数"：系统、终端、发行版版本、来源与配置方式。
 *
 * 与旧的四步向导相比，这里**没有 step / canProceed / next / previous**：内容不再按步骤隐藏，
 * 参数只是筛选出"这一页该显示哪些命令"。命令生成链路（@mirrorn/shared/generators）完全复用。
 */
export interface GuideParams {
  os: Ref<OperatingSystem>;
  shell: Ref<ShellKind>;
  /** 当前平台需要选择的发行版版本；数据不按版本区分时为 undefined。 */
  version: Ref<string | undefined>;
  mirrorId: Ref<string>;
  platforms: PlatformOption[];
  shells: ComputedRef<ShellKind[]>;
  /** 当前平台可选的发行版版本（按数据顺序，通常新版本在前）。 */
  versions: ComputedRef<string[]>;
  /** 形如 "Ubuntu 24.04" 的展示标签，用于说明当前命令针对哪个版本。 */
  versionLabel: ComputedRef<string | undefined>;
  mirrors: ComputedRef<Mirror[]>;
  guide: ComputedRef<GuideResult>;
  detectionNote: ComputedRef<string | undefined>;
  /** 用户是否已经手动选过来源。选过之后推荐结果不再自动替换它。 */
  mirrorPinned: ComputedRef<boolean>;
  setOs: (os: OperatingSystem) => void;
  setShell: (shell: ShellKind) => void;
  setVersion: (version: string) => void;
  setMirror: (mirrorId: string) => void;
  /**
   * 应用测速推荐：只在用户还没有手动选过来源、且该镜像确实在当前候选里时才生效。
   * 推荐结果在探测过程中会变，所以这里允许反复调用；一旦用户点过任何一个来源，
   * 后续调用不再改变选择，也不会改变已经生成的命令。
   */
  applyRecommendation: (mirrorId: string | undefined) => void;
}

export interface GuideParamsOptions {
  /** 显式传入该生态可用的镜像，便于测试和上层复用；默认取本地数据目录。 */
  mirrors?: Mirror[];
  detectedOs?: OperatingSystem;
  detectedShell?: ShellKind;
}

/** 文档的章节。id 同时用作锚点后缀与进度动作名：configure / verify / restore 三项计入进度。 */
export const GUIDE_SECTIONS = [
  { id: 'source', title: '选择来源' },
  { id: 'configure', title: '配置命令' },
  { id: 'verify', title: '验证配置' },
  { id: 'restore', title: '恢复与还原' },
  { id: 'faq', title: '常见问题' },
] as const;

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]['id'];

function isDefinedValue(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/**
 * 参数状态与生成结果的唯一来源。页面只负责渲染，所有联动规则都在这里，
 * 这样可以在不挂载组件的情况下测试「换系统后终端是否纠正」「换源后命令是否同步」。
 */
export function createGuideParams(
  ecosystem: Ecosystem,
  options: GuideParamsOptions = {},
): GuideParams {
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

  const mirrorId = ref(mirrors.value[0]?.id ?? '');
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

  const detectionNote = computed<string | undefined>(() => {
    if (options.detectedOs === undefined && options.detectedShell === undefined) {
      const detectedForOs = detectShell(os.value);
      if (!osShells().includes(detectedForOs)) {
        return `检测到 ${OPERATING_SYSTEM_LABELS[os.value]} 的默认终端是 ${SHELL_LABELS[detectedForOs]}，当前数据只有 ${osShells()
          .map((item) => SHELL_LABELS[item])
          .join('、')} 模板；本页中的命令在这些终端里写法一致。`;
      }
    }
    return undefined;
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
    os,
    shell,
    version,
    mirrorId,
    platforms,
    shells: computed(osShells),
    versions,
    versionLabel,
    mirrors: computed(() => mirrors.value),
    guide,
    detectionNote,
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
