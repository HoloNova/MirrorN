import { contentCategoryIds } from '../categories.ts';
import type { ContentIssue, ContentLocation, FieldPath } from '../diagnostics.ts';
import { documentNodes } from '../parse/document-types.ts';
import type { ResourceInput } from '../registry/input.ts';
import { isFileSource, type DraftSourcesData } from '../schema/sources.ts';

export function issueAt(location: ContentLocation, code: string, message: string): ContentIssue {
  return { ...location, code, message };
}

type SourceDataIndex = {
  readonly [Section in 'artifacts' | 'sources' | 'groups' | 'assets' | 'compatibility']: ReadonlyMap<string, DraftSourcesData[Section][number]>;
};

export function sourceIndex(data: DraftSourcesData): SourceDataIndex {
  return {
    artifacts: new Map(data.artifacts.map((entry) => [entry.id, entry])),
    sources: new Map(data.sources.map((entry) => [entry.id, entry])),
    groups: new Map(data.groups.map((entry) => [entry.id, entry])),
    assets: new Map(data.assets.map((entry) => [entry.id, entry])),
    compatibility: new Map(data.compatibility.map((entry) => [entry.id, entry])),
  };
}

function duplicateIssues(input: ResourceInput): readonly ContentIssue[] {
  return (['artifacts', 'sources', 'groups', 'assets', 'compatibility'] as const).flatMap((section) => {
    const entries = input.data[section];
    const first = new Map(entries.map((entry, index) => [entry.id, index] as const).toReversed());
    return entries.flatMap((entry, index) => first.get(entry.id) === index ? [] : [
      issueAt(input.sourceData.locate([section, index, 'id']), 'E_DUPLICATE', `${section} 内重复 ID ${entry.id}`),
    ]);
  });
}

function sourceIssues(input: ResourceInput): readonly ContentIssue[] {
  const index = sourceIndex(input.data);
  return input.data.sources.flatMap((source, sourceNumber) => {
    const at = (field: string) => input.sourceData.locate(['sources', sourceNumber, field]);
    const artifactId = 'artifactId' in source ? source.artifactId : undefined;
    const target = 'target' in source ? source.target : undefined;
    return [
      ...(source.health === 'available' && !source.checkedAt ? [issueAt(at('checkedAt'), 'E_SOURCE', 'available 必须记录 checkedAt')] : []),
      ...(source.health === 'broken' && !source.note ? [issueAt(at('note'), 'E_SOURCE', 'broken 必须记录原因 note')] : []),
      ...(artifactId && !index.artifacts.has(artifactId) ? [issueAt(at('artifactId'), 'E_REFERENCE', `产物不存在：${artifactId}`)] : []),
      ...(source.type === 'local' && source.assetId && !index.assets.has(source.assetId) ? [issueAt(at('assetId'), 'E_REFERENCE', `附件不存在：${source.assetId}`)] : []),
      ...(target === 'page' && artifactId ? [issueAt(at('artifactId'), 'E_SOURCE', '网页入口不填写 artifactId，不能伪装为文件')] : []),
      ...(!input.metadata.draft && isFileSource(source) && !artifactId ? [issueAt(at('artifactId'), 'E_SOURCE', '发布文件入口必须指定 artifactId')] : []),
    ];
  });
}

function groupIssues(input: ResourceInput): readonly ContentIssue[] {
  const index = sourceIndex(input.data);
  return input.data.groups.flatMap((group, groupNumber) => {
    const sourceIssues = group.sourceIds.flatMap((id, sourceNumber) => index.sources.has(id) ? [] : [
      issueAt(input.sourceData.locate(['groups', groupNumber, 'sourceIds', sourceNumber]), 'E_REFERENCE', `来源不存在：${id}`),
    ]);
    if (!group.defaultSourceId) return sourceIssues;
    const location = input.sourceData.locate(['groups', groupNumber, 'defaultSourceId']);
    const defaultSource = index.sources.get(group.defaultSourceId);
    if (!group.sourceIds.includes(group.defaultSourceId)) return [...sourceIssues, issueAt(location, 'E_SOURCE', '默认来源必须属于本组')];
    if (defaultSource?.health === 'broken') return [...sourceIssues, issueAt(location, 'E_SOURCE', 'broken 来源不能作为默认值')];
    return sourceIssues;
  });
}

function metadataIssues(input: ResourceInput): readonly ContentIssue[] {
  const at = (field: string) => input.metadataData.locate([field]);
  const metadata = input.metadata;
  const body = documentNodes(input.document.children).some((node) => (
    (('value' in node) && node.value.trim().length > 0) || node.type === 'image' || node.type === 'resourceDirective'
  ));
  return [
    ...(metadata.id !== input.directory.id ? [issueAt(at('id'), 'E_DIRECTORY', `Front Matter id 必须等于目录名 ${input.directory.id}`)] : []),
    ...(metadata.defaultVersion && !input.data.artifacts.some((artifact) => artifact.version === metadata.defaultVersion)
      ? [issueAt(at('defaultVersion'), 'E_REFERENCE', 'defaultVersion 必须与某个产物 version 精确匹配')] : []),
    ...(metadata.icon && !metadata.icon.startsWith('assets/') && !contentCategoryIds.includes(metadata.icon as (typeof contentCategoryIds)[number])
      ? [issueAt(at('icon'), 'E_REFERENCE', '未注册图标 ID；当前可用八个分类 ID，或使用 assets/ 图片')] : []),
    ...(!metadata.draft && !body ? [issueAt(at('name'), 'E_DOCUMENT', '公开资源必须有有效正文')] : []),
    ...(!metadata.draft && metadata.category !== 'document' && !input.data.sources.length
      ? [issueAt(input.sourceData.locate(['sources']), 'E_SOURCE', '非 document 分类发布至少需要一条完整来源')] : []),
  ];
}

export function validateSourceData(input: ResourceInput): readonly ContentIssue[] {
  return [...duplicateIssues(input), ...sourceIssues(input), ...groupIssues(input), ...metadataIssues(input)];
}

export function jsonIssue(input: ResourceInput, path: FieldPath, code: string, message: string): ContentIssue {
  return issueAt(input.sourceData.locate(path), code, message);
}
