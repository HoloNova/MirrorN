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
  temporary: '临时使用',
  persistent: '全局生效',
  configFile: '配置文件',
};

export interface PlatformOption {
  os: OperatingSystem;
  shells: ShellKind[];
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
}

function uniqueSorted<T extends string>(values: T[], order: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => order.indexOf(left) - order.indexOf(right));
}

/** 数据里实际存在模板的系统与终端组合，用于只向用户展示可用选项。 */
export function listPlatforms(ecosystem: Ecosystem): PlatformOption[] {
  const byOs = new Map<OperatingSystem, ShellKind[]>();

  for (const guide of ecosystem.guides) {
    const shells = byOs.get(guide.os) ?? [];
    shells.push(guide.shell);
    byOs.set(guide.os, shells);
  }

  return uniqueSorted([...byOs.keys()], OS_ORDER).map((os) => ({
    os,
    shells: uniqueSorted(byOs.get(os) ?? [], SHELL_ORDER),
  }));
}

export function describePlatforms(ecosystem: Ecosystem): string {
  return listPlatforms(ecosystem)
    .map(
      (option) =>
        `${OPERATING_SYSTEM_LABELS[option.os]}/${option.shells
          .map((shell) => SHELL_LABELS[shell])
          .join('、')}`,
    )
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
  const { ecosystem, mirror, os, shell } = request;

  const support = ecosystem.supports.find((item) => item.mirrorId === mirror.id);
  if (!support) {
    return {
      ok: false,
      reason: 'unsupported-mirror',
      message: `${mirror.name} 没有为 ${ecosystem.name} 提供仓库地址，无法生成配置命令。`,
    };
  }

  const candidates = ecosystem.guides.filter((guide) => guide.os === os && guide.shell === shell);
  if (candidates.length === 0) {
    const available = describePlatforms(ecosystem);
    return {
      ok: false,
      reason: 'unsupported-platform',
      message: available
        ? `${ecosystem.name} 目前没有 ${OPERATING_SYSTEM_LABELS[os]}/${SHELL_LABELS[shell]} 的模板。可用组合：${available}。`
        : `${ecosystem.name} 目前没有可用的配置模板。`,
    };
  }

  const variant = pickVariant(candidates);
  if (!variant) {
    return {
      ok: false,
      reason: 'ambiguous-platform',
      message: `${OPERATING_SYSTEM_LABELS[os]}/${SHELL_LABELS[shell]} 对应多个模板（${candidates
        .map((guide) => guide.id)
        .join('、')}），需要先确定具体系统版本。`,
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
