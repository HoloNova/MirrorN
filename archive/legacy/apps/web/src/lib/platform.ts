import type { OperatingSystem, ShellKind } from '@mirrorn/shared/generators';

interface NavigatorLike {
  userAgent?: string;
  userAgentData?: { platform?: string };
}

/**
 * 浏览器只能给出粗略线索，检测结果只用于给向导设初始值，用户可以随时改。
 * 数据里没有对应模板时，向导会退回到该系统的第一个可用终端。
 */
export function detectOperatingSystem(
  nav: NavigatorLike | undefined = globalThis.navigator,
): OperatingSystem {
  const hint = `${nav?.userAgentData?.platform ?? ''} ${nav?.userAgent ?? ''}`.toLowerCase();

  if (hint.includes('win')) {
    return 'windows';
  }
  if (hint.includes('mac')) {
    return 'macos';
  }
  return 'linux';
}

/** 各系统常见的默认终端，同样只是初始建议。 */
export function detectShell(os: OperatingSystem): ShellKind {
  if (os === 'windows') {
    return 'powershell';
  }
  if (os === 'macos') {
    return 'zsh';
  }
  return 'bash';
}
