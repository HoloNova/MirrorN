export type ArtifactPlatform = 'windows' | 'macos' | 'linux' | 'any' | 'unknown';

export interface ParsedArtifact {
  version: string;
  platform: ArtifactPlatform;
  arch: string;
  format: string;
}

/** 能被用户直接下载使用的格式。校验文件、签名、种子这类一律不进列表。 */
const FORMATS: Array<{ pattern: RegExp; format: string }> = [
  { pattern: /\.tar\.gz(\.\d+)?$/i, format: 'tar.gz' },
  { pattern: /\.tar\.xz(\.\d+)?$/i, format: 'tar.xz' },
  { pattern: /\.tar\.bz2(\.\d+)?$/i, format: 'tar.bz2' },
  { pattern: /\.tar\.zst(\.\d+)?$/i, format: 'tar.zst' },
  { pattern: /\.tgz$/i, format: 'tgz' },
  { pattern: /\.zip$/i, format: 'zip' },
  { pattern: /\.7z$/i, format: '7z' },
  { pattern: /\.img\.gz$/i, format: 'img.gz' },
  { pattern: /\.img\.bz2$/i, format: 'img.bz2' },
  { pattern: /\.img\.xz$/i, format: 'img.xz' },
  { pattern: /\.cpio\.gz$/i, format: 'cpio.gz' },
  { pattern: /\.iso\.bz2$/i, format: 'iso.bz2' },
  { pattern: /\.iso\.xz$/i, format: 'iso.xz' },
  { pattern: /\.iso$/i, format: 'iso' },
  { pattern: /\.dmg$/i, format: 'dmg' },
  { pattern: /\.pkg$/i, format: 'pkg' },
  { pattern: /\.msi$/i, format: 'msi' },
  { pattern: /\.exe$/i, format: 'exe' },
  { pattern: /\.deb$/i, format: 'deb' },
  { pattern: /\.rpm$/i, format: 'rpm' },
  { pattern: /\.apk$/i, format: 'apk' },
  { pattern: /\.sh$/i, format: 'sh' },
  { pattern: /\.tar$/i, format: 'tar' },
  { pattern: /\.gz$/i, format: 'gz' },
  { pattern: /\.xz$/i, format: 'xz' },
];

const ARCHES: Array<{ pattern: RegExp; arch: string }> = [
  { pattern: /(?:^|[-_.])(?:amd64|x86[_-]?64|x64)(?:[-_.]|$)/i, arch: 'x64' },
  { pattern: /(?:^|[-_.])(?:i386|i686|x86|32bit)(?:[-_.]|$)/i, arch: 'x86' },
  { pattern: /(?:^|[-_.])(?:aarch64|arm64)(?:[-_.]|$)/i, arch: 'arm64' },
  { pattern: /(?:^|[-_.])(?:armv7l|armhf|armv7)(?:[-_.]|$)/i, arch: 'armv7l' },
  { pattern: /(?:^|[-_.])(?:riscv64|rv64)(?:[-_.]|$)/i, arch: 'riscv64' },
  { pattern: /(?:^|[-_.])(?:loongarch64|loong64)(?:[-_.]|$)/i, arch: 'loong64' },
  { pattern: /(?:^|[-_.])ppc64le(?:[-_.]|$)/i, arch: 'ppc64le' },
  { pattern: /(?:^|[-_.])s390x(?:[-_.]|$)/i, arch: 's390x' },
];

function formatOf(filename: string): string | undefined {
  for (const entry of FORMATS) {
    if (entry.pattern.test(filename)) return entry.format;
  }
  return undefined;
}

function archOf(filename: string): string {
  for (const entry of ARCHES) {
    if (entry.pattern.test(filename)) return entry.arch;
  }
  return 'unknown';
}

function platformOf(filename: string, format: string): ArtifactPlatform {
  if (/(?:^|[-_.])(?:win(?:dows|32|64)?|win)(?:[-_.]|$)/i.test(filename)) return 'windows';
  if (/(?:^|[-_.])(?:darwin|macos|osx|mac)(?:[-_.]|$)/i.test(filename)) return 'macos';
  if (/(?:^|[-_.])linux(?:[-_.]|$)/i.test(filename)) return 'linux';
  // 桌面 ISO 与磁盘镜像没有“平台”之分：装着它的是要装系统的那台机器。
  if (['iso', 'iso.bz2', 'iso.xz', 'img.gz', 'img.bz2', 'img.xz', 'cpio.gz'].includes(format)) {
    return 'any';
  }
  return 'unknown';
}

/** 版本号取文件名里第一段像版本的数字；只有“latest/current/stable”这类别名时才用别名。 */
function versionOf(filename: string): string {
  const match = /(?:^|[-_.v])(\d+(?:\.\d+){1,3}(?:[-_.]\d+)?)(?:[-_.]|$)/.exec(filename);
  if (match?.[1] !== undefined) return match[1];
  const alias = /(?:^|[-_])latest(?:[-_.]|$)/i.exec(filename);
  return alias === null ? '' : 'latest';
}

const MINICONDA =
  /^Miniconda3-py(\d+)_(\d+\.\d+\.\d+)-(\d+)-(Windows-x86_64\.exe|Windows-arm64\.exe|MacOSX-x86_64\.(?:pkg|sh)|MacOSX-arm64\.(?:pkg|sh)|Linux-x86_64\.sh|Linux-aarch64\.sh)$/;

const NODE = /^node-v(\d+\.\d+\.\d+)-(.+)$/;

/** Node 发行包的后缀 → 平台/架构。headers、源码包这类不是给普通用户装的，返回 undefined。 */
const NODE_TARGETS: Record<string, { platform: ArtifactPlatform; arch: string }> = {
  'win-x64.zip': { platform: 'windows', arch: 'x64' },
  'win-x86.zip': { platform: 'windows', arch: 'x86' },
  'win-arm64.zip': { platform: 'windows', arch: 'arm64' },
  'win-x64.7z': { platform: 'windows', arch: 'x64' },
  'win-arm64.7z': { platform: 'windows', arch: 'arm64' },
  'x64.msi': { platform: 'windows', arch: 'x64' },
  'x86.msi': { platform: 'windows', arch: 'x86' },
  'arm64.msi': { platform: 'windows', arch: 'arm64' },
  'darwin-x64.tar.gz': { platform: 'macos', arch: 'x64' },
  'darwin-arm64.tar.gz': { platform: 'macos', arch: 'arm64' },
  'darwin-x64.tar.xz': { platform: 'macos', arch: 'x64' },
  'darwin-arm64.tar.xz': { platform: 'macos', arch: 'arm64' },
  'darwin-x64.pkg': { platform: 'macos', arch: 'x64' },
  'darwin-arm64.pkg': { platform: 'macos', arch: 'arm64' },
  'linux-x64.tar.xz': { platform: 'linux', arch: 'x64' },
  'linux-x64.tar.gz': { platform: 'linux', arch: 'x64' },
  'linux-arm64.tar.xz': { platform: 'linux', arch: 'arm64' },
  'linux-armv7l.tar.xz': { platform: 'linux', arch: 'armv7l' },
  'linux-ppc64le.tar.xz': { platform: 'linux', arch: 'ppc64le' },
  'linux-s390x.tar.xz': { platform: 'linux', arch: 's390x' },
};

/**
 * 从文件名解析一个可下载文件。解析不出来就返回 undefined——
 * 宁可列表里少一项，也不用猜测的版本/平台填满页面。
 */
export function parseArtifactFilename(filename: string): ParsedArtifact | undefined {
  const miniconda = MINICONDA.exec(filename);
  if (miniconda) {
    const [, , release, build, target] = miniconda;
    const platform: ArtifactPlatform = target?.startsWith('Windows-')
      ? 'windows'
      : target?.startsWith('MacOSX-')
        ? 'macos'
        : 'linux';
    const arch = target?.includes('x86_64')
      ? 'x64'
      : target?.includes('aarch64') || target?.includes('arm64')
        ? 'arm64'
        : 'unknown';
    return {
      version: `${release}-${build}`,
      platform,
      arch,
      format: formatOf(filename) ?? 'unknown',
    };
  }

  const node = NODE.exec(filename);
  if (node) {
    const [, version, target] = node;
    const known = target === undefined ? undefined : NODE_TARGETS[target];
    if (version === undefined || known === undefined) return undefined;
    return {
      version: `v${version}`,
      platform: known.platform,
      arch: known.arch,
      format: formatOf(filename) ?? 'unknown',
    };
  }

  const format = formatOf(filename);
  if (format === undefined) return undefined;
  return {
    version: versionOf(filename),
    platform: platformOf(filename, format),
    arch: archOf(filename),
    format,
  };
}
