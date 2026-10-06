import type { Ecosystem, GuideVariant, Mirror } from '../schemas.js';

import { renderTemplate } from './template.js';

export type OperatingSystem = GuideVariant['os'];
export type ShellKind = GuideVariant['shell'];
export type GuideMode = 'temporary' | 'persistent' | 'configFile';
export type ConfigFileFormat = 'ini' | 'json' | 'text';

/**
 * 模板里的 `{{packageName}}` 由页面替换成这个占位符，而不是猜用户要装什么包。
 * 用户复制命令后需要自己替换它。
 */
export const PACKAGE_NAME_PLACEHOLDER = '<包名>';

const OS_ORDER: OperatingSystem[] = ['windows', 'macos', 'linux'];
const SHELL_ORDER: ShellKind[] = ['powershell', 'cmd', 'bash', 'zsh'];
const MODE_ORDER: GuideMode[] = ['temporary', 'persistent', 'configFile'];

export const OPERATING_SYSTEM_LABELS: Record<OperatingSystem, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

export const SHELL_LABELS: Record<ShellKind, string> = {
  powershell: 'PowerShell',
  cmd: 'CMD',
  bash: 'Bash',
  zsh: 'Zsh',
};

export const GUIDE_MODE_LABELS: Record<GuideMode, string> = {
  temporary: '瞬态执行',
  persistent: '持久写入',
  configFile: '配置文件',
};

export interface PlatformOption {
  os: OperatingSystem;
  shells: ShellKind[];
  /**
   * 该平台下需要用户选择的发行版版本（例如 Ubuntu 的 24.04 / 22.04）。
   *
   * 为什么要有这个维度：同一套系统与终端的命令会因为发行版版本不同而不同
   * （apt 的 sources.list 与 deb822 格式、仓库代号都随版本变化）。
   * 数据里没有按版本区分时为**空数组**，界面不展示版本选择器。
   */
  versions: string[];
}

export interface GeneratedCommand {
  mode: 'temporary' | 'persistent';
  label: string;
  command: string;
  note?: string;
}

export interface GeneratedConfigFile {
  path: string;
  format: ConfigFileFormat;
  content: string;
  instructions: string;
  backup?: string;
}

export interface GeneratedVerification {
  command: string;
  expected: string;
  note?: string;
}

export interface GeneratedRestore {
  command: string;
  expected: string;
  note?: string;
}

export interface GeneratedGuide {
  ecosystem: { id: string; name: string; packageManager: string };
  mirror: {
    id: string;
    name: string;
    kind: Mirror['kind'];
    homepageUrl: string;
    repositoryUrl: string;
    supportsPublish: boolean;
    checkedAt: string;
  };
  platform: {
    os: OperatingSystem;
    shell: ShellKind;
    guideId: string;
    distribution?: string;
    version?: string;
  };
  prerequisites: string[];
  commands: GeneratedCommand[];
  configFile?: GeneratedConfigFile;
  modes: GuideMode[];
  /** 需要用户自己替换的占位符，例如 `<包名>`。 */
  placeholders: string[];
  verification: GeneratedVerification;
  restore: GeneratedRestore;
  sources: Array<{ url: string; checkedAt: string; note?: string }>;
}

export type GuideFailureReason =
  | 'unsupported-mirror'
  | 'unsupported-platform'
  | 'ambiguous-platform'
  | 'missing-template-value'
  | 'unknown-template-variable';

export type GuideResult =
  { ok: true; guide: GeneratedGuide } | { ok: false; reason: GuideFailureReason; message: string };

export interface GuideRequest {
  ecosystem: Ecosystem;
  mirror: Mirror;
  os: OperatingSystem;
  shell: ShellKind;
  /**
   * 发行版版本（例如 `24.04`）。
   *
   * 当该（系统, 终端）组合下的模板按版本区分时必须提供，否则会返回
   * `ambiguous-platform`；不按版本区分的模板忽略这个字段。
   */
  version?: string;
}

function uniqueSorted<T extends string>(values: T[], order: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => order.indexOf(left) - order.indexOf(right));
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/** 数据里实际存在模板的系统、终端与版本组合，用于只向用户展示可用选项。 */
export function listPlatforms(ecosystem: Ecosystem): PlatformOption[] {
  const byOs = new Map<OperatingSystem, { shells: ShellKind[]; versions: string[] }>();

  for (const guide of ecosystem.guides) {
    const entry = byOs.get(guide.os) ?? { shells: [], versions: [] };
    entry.shells.push(guide.shell);
    if (guide.version !== undefined) {
      entry.versions.push(guide.version);
    }
    byOs.set(guide.os, entry);
  }

  return uniqueSorted([...byOs.keys()], OS_ORDER).map((os) => {
    const entry = byOs.get(os) ?? { shells: [], versions: [] };
    return {
      os,
      shells: uniqueSorted(entry.shells, SHELL_ORDER),
      // 版本在数据里的顺序就是展示顺序（数据按新到旧排列）；不做语义化排序猜测。
      versions: [...new Set(entry.versions)],
    };
  });
}

export function describePlatforms(ecosystem: Ecosystem): string {
  return listPlatforms(ecosystem)
    .map((option) => {
      const shells = option.shells.map((shell) => SHELL_LABELS[shell]).join('、');
      const versions = option.versions.length > 0 ? `（${option.versions.join('、')}）` : '';
      return `${OPERATING_SYSTEM_LABELS[option.os]}/${shells}${versions}`;
    })
    .join('，');
}

function modesOf(variant: GuideVariant): GuideMode[] {
  const modes: GuideMode[] = [];
  for (const mode of MODE_ORDER) {
    if (variant[mode]) {
      modes.push(mode);
    }
  }
  return modes;
}

/**
 * 多个候选通常来自按发行版或版本区分的模板。此时宁可报错，
 * 也不静默挑一个可能不适用于用户的模板。
 */
function pickVariant(candidates: GuideVariant[]): GuideVariant | undefined {
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function generateGuide(request: GuideRequest): GuideResult {
  const { ecosystem, mirror, os, shell, version } = request;

  const support = ecosystem.supports.find((item) => item.mirrorId === mirror.id);
  if (!support) {
    return {
      ok: false,
      reason: 'unsupported-mirror',
      message: `${mirror.name} 没有为 ${ecosystem.name} 提供仓库地址，无法生成配置命令。`,
    };
  }

  const platformGuides = ecosystem.guides.filter(
    (guide) => guide.os === os && guide.shell === shell,
  );
  if (platformGuides.length === 0) {
    const available = describePlatforms(ecosystem);
    return {
      ok: false,
      reason: 'unsupported-platform',
      message: available
        ? `${ecosystem.name} 目前没有 ${OPERATING_SYSTEM_LABELS[os]}/${SHELL_LABELS[shell]} 的模板。可用组合：${available}。`
        : `${ecosystem.name} 目前没有可用的配置模板。`,
    };
  }

  // 只有当该平台确实按版本区分模板时才用版本过滤，否则版本字段会被忽略。
  const versions = [...new Set(platformGuides.map((guide) => guide.version).filter(isDefined))];
  const candidates =
    versions.length > 0 && version !== undefined
      ? platformGuides.filter((guide) => guide.version === version)
      : platformGuides;

  if (versions.length > 0 && version === undefined) {
    return {
      ok: false,
      reason: 'ambiguous-platform',
      message: `${OPERATING_SYSTEM_LABELS[os]}/${SHELL_LABELS[shell]} 需要先确定具体系统版本：${versions.join('、')}。`,
    };
  }

  if (versions.length > 0 && candidates.length === 0) {
    return {
      ok: false,
      reason: 'unsupported-platform',
      message: `${ecosystem.name} 没有 ${OPERATING_SYSTEM_LABELS[os]}/${SHELL_LABELS[shell]} 的 ${version} 版本模板。可用版本：${versions.join('、')}。`,
    };
  }

  const variant = pickVariant(candidates);
  if (!variant) {
    return {
      ok: false,
      reason: 'ambiguous-platform',
      message: `${OPERATING_SYSTEM_LABELS[os]}/${SHELL_LABELS[shell]}${
        version === undefined ? '' : `（${version}）`
      } 对应多个模板（${candidates.map((guide) => guide.id).join('、')}），无法确定该用哪一个。`,
    };
  }

  const values = {
    mirrorUrl: support.repositoryUrl,
    packageName: PACKAGE_NAME_PLACEHOLDER,
    configPath: variant.configFile?.path,
  };

  const failure = (reason: GuideFailureReason, detail: string) => ({
    ok: false as const,
    reason,
    message: `${ecosystem.name} 的模板 ${variant.id} ${detail}`,
  });

  const renderOrFail = (text: string, what: string) => {
    const rendered = renderTemplate(text, values);
    if (rendered.ok) {
      return { ok: true as const, text: rendered.text };
    }
    return rendered.reason === 'missing-value'
      ? failure('missing-template-value', `${what}缺少变量值：${rendered.variables.join('、')}`)
      : failure(
          'unknown-template-variable',
          `${what}使用了未知变量：${rendered.variables.join('、')}`,
        );
  };

  const commands: GeneratedCommand[] = [];
  for (const mode of ['temporary', 'persistent'] as const) {
    const source = variant[mode];
    if (!source) {
      continue;
    }
    const rendered = renderOrFail(source.command, `${source.label}命令`);
    if (!rendered.ok) {
      return rendered;
    }
    commands.push({
      mode,
      label: source.label,
      command: rendered.text,
      note: source.note,
    });
  }

  let configFile: GeneratedConfigFile | undefined;
  if (variant.configFile) {
    const renderedContent = renderOrFail(variant.configFile.content, '配置文件内容');
    if (!renderedContent.ok) {
      return renderedContent;
    }
    const renderedPath = renderOrFail(variant.configFile.path, '配置文件路径');
    if (!renderedPath.ok) {
      return renderedPath;
    }
    configFile = {
      path: renderedPath.text,
      format: variant.configFile.format,
      content: renderedContent.text,
      instructions: variant.configFile.instructions,
      backup: variant.configFile.backup,
    };
  }

  const renderedVerification = renderOrFail(variant.verification.command, '验证命令');
  if (!renderedVerification.ok) {
    return renderedVerification;
  }

  const renderedRestore = renderOrFail(variant.restore.command, '还原命令');
  if (!renderedRestore.ok) {
    return renderedRestore;
  }

  const renderableTexts = [
    ...commands.map((command) => command.command),
    configFile?.content ?? '',
    renderedVerification.text,
    renderedRestore.text,
  ];
  const placeholders = renderableTexts.some((text) => text.includes(PACKAGE_NAME_PLACEHOLDER))
    ? [PACKAGE_NAME_PLACEHOLDER]
    : [];

  return {
    ok: true,
    guide: {
      ecosystem: {
        id: ecosystem.id,
        name: ecosystem.name,
        packageManager: ecosystem.packageManager,
      },
      mirror: {
        id: mirror.id,
        name: mirror.name,
        kind: mirror.kind,
        homepageUrl: mirror.homepageUrl,
        repositoryUrl: support.repositoryUrl,
        supportsPublish: support.supportsPublish,
        checkedAt: support.sources[0]?.checkedAt ?? mirror.sources[0]?.checkedAt ?? '',
      },
      platform: {
        os: variant.os,
        shell: variant.shell,
        guideId: variant.id,
        distribution: variant.distribution,
        version: variant.version,
      },
      prerequisites: ecosystem.prerequisites,
      commands,
      configFile,
      modes: modesOf(variant),
      placeholders,
      verification: {
        command: renderedVerification.text,
        expected: variant.verification.expected,
        note: variant.verification.note,
      },
      restore: {
        command: renderedRestore.text,
        expected: variant.restore.expected,
        note: variant.restore.note,
      },
      sources: support.sources.map((source) => ({
        url: source.url,
        checkedAt: source.checkedAt,
        note: source.note,
      })),
    },
  };
}
