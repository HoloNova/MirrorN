import type { DownloadBinding } from '@mirrorn/shared';
import type { Download } from '../../db/installers.js';
import type { RuleSet } from './load.js';
import { normalizeMatch, fileFormat } from './normalize.js';
import { isFileLeaf, bindingDirectory } from './templates.js';

export type Classification =
  | {
      decision: 'accepted';
      software: string;
      download: Omit<Download, 'filename' | 'url' | 'size'>;
    }
  | { decision: 'rejected' | 'pending'; reason: string };
const companion =
  /^(?:README(?:\..*)?|HEADER(?:\..*)?|index\.html|(?:SHA\d*|MD5)SUMS.*|TEXLIVE_\d{4})$|\.(?:asc|sig|sha\d*|md5|torrent|zsync|manifest|list|rpmlist|cdx\.(?:json|xml))$/i;
const excluded =
  /(?:^|[-_.])(?:src|sources?|headers|debug|symbols|docs?|fulldocs|deployer|javadoc|tests?|examples)(?:[-_.]|$)/i;
/** 先判明确排除，再按审核上下文提取；未匹配不是rejected，冲突不是first match wins。 */
export function classifyFile(
  set: RuleSet,
  binding: DownloadBinding,
  directory: string,
  filename: string,
  listingNames: readonly string[] = [],
): Classification {
  if (companion.test(filename)) return { decision: 'rejected', reason: 'companion_metadata' };
  if (excluded.test(filename)) return { decision: 'rejected', reason: 'source_document_or_debug' };
  const rule = set.rules.get(binding.ruleId)!;
  if (rule.reject.some((pattern) => new RegExp(pattern).test(filename)))
    return { decision: 'rejected', reason: 'explicit_rule_rejection' };
  const format = fileFormat(filename);
  if (!format) return { decision: 'pending', reason: 'unknown_format_or_role' };
  if (!isFileLeaf(binding, directory))
    return { decision: 'pending', reason: 'unreviewed_file_context' };
  const results: { software: string; download: Omit<Download, 'filename' | 'url' | 'size'> }[] = [];
  let matched = false;
  for (const match of rule.matches) {
    const groups = new RegExp(match.pattern).exec(filename)?.groups;
    if (!groups) continue;
    matched = true;
    if (groups.format !== format) return { decision: 'pending', reason: 'conflicting_format' };
    const normalized = normalizeMatch(match, groups, listingNames, rule.softwareIds);
    if (normalized) {
      const { software, ...download } = normalized;
      const parts = bindingDirectory(binding, directory).relative.split('/').filter(Boolean);
      if (['nodejs', 'tomcat', 'kafka', 'maven'].includes(rule.id)) {
        const directoryVersion = parts.find((part) =>
          /^v?\d+\.\d+(?:\.\d+)?(?:-[\w.-]+)?$/.test(part),
        );
        if (
          directoryVersion &&
          directoryVersion.replace(/^v/, '') !== download.version.replace(/^v/, '')
        )
          return { decision: 'pending', reason: 'version_context_conflict' };
      }
      results.push({
        software,
        download: {
          ...download,
          metadata: { ...download.metadata, ruleId: rule.id, ruleRevision: set.revision },
        },
      });
    }
  }
  if (!results.length)
    return {
      decision: 'pending',
      reason: matched ? 'missing_or_invalid_fields' : 'unrecognized_filename',
    };
  const representations = new Set(results.map((result) => JSON.stringify(result)));
  if (representations.size !== 1) return { decision: 'pending', reason: 'ambiguous_rule' };
  const result = results[0]!;
  // 同一审核根的多软件规则不能抢占同一URL。
  for (const other of set.active) {
    if (
      other.id === binding.id ||
      other.siteId !== binding.siteId ||
      other.rootPath !== binding.rootPath ||
      !isFileLeaf(other, directory)
    )
      continue;
    const otherRule = set.rules.get(other.ruleId)!;
    for (const match of otherRule.matches) {
      const groups = new RegExp(match.pattern).exec(filename)?.groups;
      if (!groups) continue;
      const normalized = normalizeMatch(match, groups, listingNames, otherRule.softwareIds);
      if (
        normalized &&
        (normalized.software !== result.software ||
          JSON.stringify({
            ...normalized,
            software: undefined,
            metadata: { ...normalized.metadata, ruleId: rule.id, ruleRevision: set.revision },
          }) !== JSON.stringify({ ...result.download, software: undefined }))
      )
        return { decision: 'pending', reason: 'ambiguous_software_binding' };
    }
  }
  // 只保存相对上下文，不把目录正文放入下载记录。
  result.download.metadata = {
    ...result.download.metadata,
    context: bindingDirectory(binding, directory).relative,
    bindingId: binding.id,
  };
  return { decision: 'accepted', ...result };
}
