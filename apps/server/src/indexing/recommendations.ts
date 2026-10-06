import type { VersionPolicy, VersionRule } from '@mirrorn/shared';
import { compareRepoVersions } from './versions.js';
import type { RuleSet } from './rules/load.js';

export interface ReleaseVersion {
  readonly components: readonly number[];
  /** 原始数字部分（保留 26.04 这类前导零），支线名称按它截取。 */
  readonly text: string;
  readonly prerelease: boolean;
}
// 字母前缀（tomcat-、openEuler-）与 v 前缀都允许；后缀只有纯数字或 LTS/SP 这类才算正式版。
const releasePattern = /^[^\d\s/]*v?(\d+(?:\.\d+)*)([^\d\s/].*)?$/;
const stableSuffix = /^(?:lts(?:-sp\d+)*|sp\d+|ga|final|release|stable|rev\d+)$/i;
export function releaseVersion(name: string): ReleaseVersion | undefined {
  const match = releasePattern.exec(name);
  if (!match) return undefined;
  const components = match[1]!.split('.').map(Number);
  if (components.some((value) => !Number.isSafeInteger(value))) return undefined;
  const suffix = match[2]?.replace(/^[-_.]+/, '').replace(/[-_.]+$/, '');
  // 纯数字后缀是构建号，'+' 开头是语义化构建元数据，都不算预览版。
  const prerelease = Boolean(
    suffix && !suffix.startsWith('+') && /[a-z]/i.test(suffix) && !stableSuffix.test(suffix),
  );
  return { components, text: match[1]!, prerelease };
}
function lineOf(version: ReleaseVersion, rule: VersionRule) {
  return version.text.split('.').slice(0, rule.lineParts).join('.');
}
export function recommendationRule(set: RuleSet, software: string): VersionRule | undefined {
  const policy: VersionPolicy | undefined = set.versionPolicy;
  if (!policy) return undefined;
  return (
    policy.software[software] ??
    policy.ecosystems[
      set.identities.find((identity) => identity.slug === software)?.ecosystemId ?? ''
    ] ??
    policy.default
  );
}
/**
 * 取推荐版本：自动保留最新的 latestLines 条支线，外加 keepLines 里点名保留的支线（学校常用旧版本）。
 * 每条支线只留最新补丁，预览版与到期支线丢掉；无法解析的别名和纯文本保留。
 * 结果不会为空，避免规则配置失误把某个软件的下载全部清掉。
 */
export function selectRecommendedVersions(
  set: RuleSet,
  software: string,
  versions: readonly string[],
  now = Date.now(),
): string[] {
  const rule = recommendationRule(set, software);
  if (!rule || versions.length < 2) return [...versions];
  const lines = new Map<string, string[]>(),
    forced = new Set<string>();
  for (const raw of new Set(versions)) {
    const version = releaseVersion(raw);
    if (!version) continue;
    if (rule.prerelease === 'exclude' && version.prerelease) continue;
    const line = lineOf(version, rule);
    // keepLines 点名保留的支线不受形态与到期日限制，但同样只留最新补丁。
    if (rule.keepLines.includes(line)) forced.add(line);
    else {
      if (rule.linePattern && !new RegExp(rule.linePattern).test(line)) continue;
      const expiry = rule.eol[line];
      if (expiry && Date.parse(`${expiry}T00:00:00Z`) < now) continue;
    }
    lines.set(line, [...(lines.get(line) ?? []), raw]);
  }
  const byLine = [...lines.entries()].sort((a, b) => compareRepoVersions('', b[0], a[0]));
  const latest = new Set(byLine.slice(0, rule.latestLines).map(([line]) => line));
  const selected = byLine
    .filter(([line]) => latest.has(line) || forced.has(line))
    .map(([, candidates]) =>
      candidates.reduce((best, raw) => (compareRepoVersions('', raw, best) > 0 ? raw : best)),
    );
  return selected.length ? selected : [...versions];
}
/** 目录层过滤：返回 null 表示本次不限制；返回集合表示集合外的版本目录不再递归。 */
export function recommendedDirectories(
  set: RuleSet,
  softwareIds: readonly string[],
  names: readonly string[],
  now = Date.now(),
): Set<string> | undefined {
  if (!names.length) return undefined;
  const keep = new Set<string>();
  let limited = false;
  for (const software of softwareIds) {
    const selected = selectRecommendedVersions(set, software, names, now);
    if (selected.length !== new Set(names).size) limited = true;
    for (const name of selected) keep.add(name);
  }
  return limited ? keep : undefined;
}
