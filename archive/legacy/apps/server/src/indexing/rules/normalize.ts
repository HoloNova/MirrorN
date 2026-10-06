import type { DownloadMatch } from '@mirrorn/shared';
import type { Download } from '../../db/installers.js';

const archAliases: Record<string, string> = {
  amd64: 'x64',
  x86_64: 'x64',
  x86: 'x86',
  i386: 'x86',
  i686: 'x86',
  aarch64: 'arm64',
  arm64: 'arm64',
  ppc64el: 'ppc64le',
  ppc64le: 'ppc64le',
  armhf: 'armv7l',
  armv7l: 'armv7l',
  armv6l: 'armv6l',
  s390x: 's390x',
  riscv64: 'riscv64',
  loongarch64: 'loongarch64',
  x64: 'x64',
};
export function normalizeArch(value?: string) {
  return value ? (archAliases[value] ?? 'unknown') : 'unknown';
}
const platformAliases: Record<string, 'windows' | 'macos' | 'linux'> = {
  Windows: 'windows',
  win: 'windows',
  windows: 'windows',
  MacOSX: 'macos',
  darwin: 'macos',
  macos: 'macos',
  Linux: 'linux',
  linux: 'linux',
};
const formats = [
  'tar.bz2',
  'tar.xz',
  'tar.gz',
  'AppImage',
  'msi',
  'pkg',
  'dmg',
  'exe',
  'sh',
  'zip',
  '7z',
  'tgz',
  'iso',
  'deb',
  'rpm',
];
export function fileFormat(filename: string) {
  return formats.find((format) => filename.endsWith(`.${format}`));
}
function validDate(value: string): boolean {
  const flat = value.replace(/\./g, '');
  if (!/^\d{8}$/.test(flat)) return false;
  const year = Number(flat.slice(0, 4)),
    month = Number(flat.slice(4, 6)),
    day = Number(flat.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
export type Normalized = Omit<Download, 'filename' | 'url' | 'size'> & { software: string };
/** 所有特殊提取器都受格式/平台/版本检查约束；无eval或动态模块。 */
export function normalizeMatch(
  match: DownloadMatch,
  captures: Record<string, string | undefined>,
  names: readonly string[],
  softwareIds: readonly string[],
): Normalized | undefined {
  const g = captures;
  const software = g.software ?? softwareIds[0]!;
  if (!softwareIds.includes(software)) return undefined;
  const platforms = match.platformCapture
    ? platformAliases[g[match.platformCapture] ?? '']
      ? [platformAliases[g[match.platformCapture]!]!]
      : []
    : [...match.platforms];
  if (match.platformCapture && platforms.length === 0) return undefined;
  const format = g.format;
  if (!format || !formats.includes(format)) return undefined;
  let version = g.version ?? g.releaseDate;
  let rawVersion = version;
  let versionKind = match.versionKind;
  const variant: Record<string, string> = {};
  for (const key of [
    'variant',
    'edition',
    'build',
    'revision',
    'scalaBuild',
    'pythonMajor',
    'pythonBuild',
    'buildVariant',
  ])
    if (g[key]) variant[key] = g[key]!;
  if (match.parser === 'conda') {
    const platform = platforms[0];
    if (
      (platform === 'windows' && format !== 'exe') ||
      (platform === 'linux' && format !== 'sh') ||
      (platform === 'macos' && !['pkg', 'sh'].includes(format))
    )
      return undefined;
  }
  if (match.parser === 'rtools') {
    if (!g.series || !g.build) return undefined;
    version = `${g.series}-${g.build}`;
    rawVersion = version;
    variant.rSeries = g.series.length === 2 ? `${g.series[0]}.${g.series[1]}` : g.series;
    variant.build = g.build;
  }
  if (match.parser === 'kubernetes') {
    if (!version || !g.revision) return undefined;
    rawVersion = `${version}-${g.revision}`;
  }
  if (match.parser === 'texlive') {
    const markers = [
      ...new Set(
        names
          .map((name) => /^TEXLIVE_(\d{4})$/.exec(name)?.[1])
          .filter((year): year is string => Boolean(year)),
      ),
    ];
    if (markers.length !== 1) return undefined;
    version = markers[0]!;
    rawVersion = version;
  }
  if (!version || version.length > 100 || (versionKind === 'date' && !validDate(version)))
    return undefined;
  if (/^(latest|current|release)$/i.test(version)) versionKind = 'alias';
  const channel =
    versionKind === 'alias'
      ? 'alias'
      : /(?:^|[-.])(?:rc|beta|alpha|pre|nightly)/i.test(version)
        ? 'preview'
        : 'release';
  return {
    software,
    version,
    platform: platforms[0] ?? 'unknown',
    arch: normalizeArch(g.arch),
    format,
    metadata: {
      platforms,
      purpose: match.purpose,
      variant,
      rawVersion: rawVersion ?? version,
      rawArch: g.arch ?? null,
      versionKind,
      channel,
      requirements: match.requirements,
    },
  };
}
