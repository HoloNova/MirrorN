//从名称、文件名和路径提取版本、平台、架构、格式，过滤源码、调试符号、校验文件等
import type { TunaCatalogBinding } from '@mirrorn/shared';
import type { Download } from '../../db/installers.js';
import { normalizeArch } from '../rules/normalize.js';

const compoundFormats = [
  '7z.exe',
  'tar.bz2',
  'tar.gz',
  'tar.xz',
  'msixbundle',
  'appxbundle',
  'pkg.tar.zst',
  'AppImage',
];
const versionNumber =
  /(?:^|[^\d])v?(\d{1,4}(?:\.\d+){1,3}(?:-(?:(?:rc|beta|alpha|pre|dev)\d*|\d+))?)/i;
const dateVersion = /(?:^|[^\d])(\d{4}[-.]\d{2}[-.]\d{2}|\d{8})(?!\d)/;
const excludedFiles =
  /(?:^|[-_. ])(?:pdbs?|symbols?|debug|debuginfo|sbom|checksums?|sha\d*|sources?|src|headers?|sdk|licenses?)(?:[-_. ]|$)|\.spdx(?:\.|$)|\.sig$|\.asc$/i;

export function tunaFormat(filename: string, binding: TunaCatalogBinding) {
  if (
    binding.formats.includes('binary') &&
    /^(?:auth-thu\.(?:linux|darwin|macos|windows)\.(?:x86_64|arm64|armv[5-8]|arm|ppc64le|riscv64|mipsbe|mipsle|loong64)|minikube-(?:linux|darwin)-[A-Za-z0-9_]+)$/.test(
      filename,
    ) &&
    !/\.(?:exe|zip|gz|xz|deb|rpm|json|txt)$/.test(filename)
  )
    return 'binary';
  const format =
    compoundFormats.find((f) => filename.toLowerCase().endsWith(`.${f.toLowerCase()}`)) ??
    filename.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ??
    undefined;
  return binding.formats.includes(format as TunaCatalogBinding['formats'][number])
    ? format
    : undefined;
}

function versionInfo(name: string, filename: string, url: URL, binding: TunaCatalogBinding) {
  const label = name.split(' (')[0]!;
  const alias = /(?:^|[-_\s])(latest|current|devel|unstable|Tumbleweed)(?=[-_\s]|$)/i
    .exec(label)?.[1]
    ?.toLowerCase();
  const date = dateVersion.exec(label)?.[1];
  const numbered = versionNumber.exec(label)?.[1];
  const leading = /^v?(\d+)(?=$|\s|[-,])/i.exec(label)?.[1];
  const directoryVersion = url.pathname
    .split('/')
    .slice(0, -1)
    .reverse()
    .find((p) => /^v?\d+(?:\.\d+){1,3}(?:-\d+)?$/.test(p));
  const fileVersion = versionNumber.exec(filename)?.[1];
  const detailedVersion =
    numbered && fileVersion?.startsWith(`${numbered}.`) ? fileVersion : numbered;
  const namedYear =
    binding.softwareId === 'texlive' ? /TeX Live\s+(\d{4})/i.exec(label)?.[1] : undefined;
  const month = /(?:^|[^\d])(\d{4}-\d{2})(?![-\d])/.exec(label)?.[1];
  const lmde = binding.softwareId === 'linuxmint' ? /^LMDE\s+(\d+)/i.exec(label)?.[1] : undefined;
  const version =
    alias ??
    namedYear ??
    date ??
    month ??
    detailedVersion ??
    leading ??
    lmde ??
    directoryVersion?.replace(/^v/, '') ??
    fileVersion ??
    dateVersion.exec(filename)?.[1] ??
    (/\/LatestRelease\/|(?:^|[-_])latest(?:[-_.]|$)/i.test(url.pathname) ? 'latest' : undefined);
  if (!version) return undefined;
  const versionKind = date
    ? 'date'
    : /^(latest|current|devel|unstable|tumbleweed)$/i.test(version)
      ? 'alias'
      : 'version';
  return {
    version,
    versionKind,
    rawVersion: label,
    channel:
      versionKind === 'alias'
        ? 'alias'
        : /rc|beta|alpha|nightly/i.test(version)
          ? 'preview'
          : 'release',
  };
}

function platformsOf(
  filename: string,
  name: string,
  url: URL,
  format: string,
  binding: TunaCatalogBinding,
): Array<'windows' | 'macos' | 'linux'> {
  if (binding.platforms) return [...binding.platforms];
  if (['exe', 'msi', '7z.exe', 'msixbundle', 'appxbundle'].includes(format)) return ['windows'];
  if (['dmg', 'pkg'].includes(format)) return ['macos'];
  if (['deb', 'rpm', 'pkg.tar.zst', 'flatpak', 'AppImage', 'run', 'iso'].includes(format))
    return ['linux'];
  const text = `${filename} ${name} ${url.pathname}`.toLowerCase();
  if (/android|freebsd|netbsd/.test(text)) return [];
  const platforms: Array<'windows' | 'macos' | 'linux'> = [];
  if (/windows|win32|win64|(?:^|[-_. /])win(?:[-_. /]|$)|mingw|cygwin/.test(text))
    platforms.push('windows');
  if (/macos|macosx|darwin|osx|(?:^|[-_. /])mac(?:[-_. /]|$)|apple/.test(text))
    platforms.push('macos');
  if (/linux|appimage|musl/.test(text)) platforms.push('linux');
  return platforms;
}

function architecture(filename: string, name: string) {
  const pattern =
    /(?:^|[-_. /(),])(x86_64|aarch64|arm64|amd64|ppc64el|ppc64le|riscv64|s390x|loongarch64|loong64|armv7l|armv6l|armv6|armv5|mipsbe|mipsle|armhf|i[3-6]86|x64|x86|universal)(?=$|[-_. /(),+])/i;
  const token = pattern.exec(filename)?.[1] ?? pattern.exec(name)?.[1];
  if (token?.toLowerCase() === 'universal') return { arch: 'universal', rawArch: token };
  if (token) {
    const raw = token.toLowerCase();
    const aliases: Record<string, string> = {
      armv5: 'armv5l',
      armv6: 'armv6l',
      loong64: 'loongarch64',
      mipsbe: 'mipsbe',
      mipsle: 'mipsle',
    };
    return { arch: aliases[raw] ?? normalizeArch(raw), rawArch: token };
  }
  if (/arm\s+64/i.test(`${filename} ${name}`)) return { arch: 'arm64', rawArch: 'Arm 64' };
  if (/intel\s+64/i.test(`${filename} ${name}`)) return { arch: 'x64', rawArch: 'Intel 64' };
  if (/64[- ]?bit/i.test(name)) return { arch: 'x64', rawArch: '64-bit' };
  if (/32[- ]?bit/i.test(name)) return { arch: 'x86', rawArch: '32-bit' };
  return { arch: 'unknown', rawArch: null };
}

export type TunaNormalization =
  | { decision: 'accepted'; download: Download }
  | { decision: 'rejected' | 'pending'; reason: string };
export function normalizeTunaDownload(
  binding: TunaCatalogBinding,
  name: string,
  url: URL,
): TunaNormalization {
  const filename = decodeURIComponent(url.pathname.split('/').at(-1)!);
  if (/android|(?:free|net|open)bsd/i.test(`${filename} ${name} ${url.pathname}`))
    return { decision: 'rejected', reason: 'unsupported_platform' };
  if (
    excludedFiles.test(filename) ||
    binding.reject.some((pattern) => new RegExp(pattern, 'i').test(filename))
  )
    return { decision: 'rejected', reason: 'non_installable' };
  const format = tunaFormat(filename, binding);
  if (!format) return { decision: 'rejected', reason: 'unsupported_format' };
  if (
    binding.softwareId === 'lyx' &&
    format === 'tar.gz' &&
    !/cygwin|macos|darwin|win32/i.test(filename)
  )
    return { decision: 'rejected', reason: 'unverified_archive' };
  const platforms: Array<'windows' | 'macos' | 'linux'> =
    binding.softwareId === 'atom' && filename === 'atom-amd64.tar.gz'
      ? ['linux']
      : platformsOf(filename, name, url, format, binding);
  if (!platforms.length) return { decision: 'pending', reason: 'unrecognized_platform' };
  const version = versionInfo(name, filename, url, binding);
  if (!version) return { decision: 'pending', reason: 'unrecognized_version' };
  const arch = architecture(filename, name);
  return {
    decision: 'accepted',
    download: {
      filename,
      url: url.href,
      version: version.version,
      platform: platforms[0]!,
      arch: arch.arch,
      format,
      metadata: {
        ...version,
        platforms,
        purpose:
          binding.purpose === 'installer' &&
          ['binary', 'gz', 'zip', '7z', 'tar.gz', 'tar.xz', 'tar.bz2', 'tgz', 'AppImage'].includes(
            format,
          )
            ? 'runtime'
            : binding.purpose,
        rawArch: arch.rawArch,
        source: 'tuna-isoinfo',
        displayName: name,
        sourceGroup: binding.group,
        sourceUrl: 'https://mirrors.tuna.tsinghua.edu.cn/static/status/isoinfo.json',
        variant: { label: name },
        requirements: {},
      },
    },
  };
}
