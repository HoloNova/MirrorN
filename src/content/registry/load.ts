import { ContentError, issuesFrom, parseSchema, type ContentIssue } from '../diagnostics.ts';
import { discoverResources, fileLocation } from '../parse/files.ts';
import { sourcesSchema } from '../schema/sources.ts';
import { validateAssets } from '../validate/assets.ts';
import { validateDirectives } from '../validate/directive-references.ts';
import { validateDocumentLinks, type ValidatedDocument } from '../validate/document-links.ts';
import type { ValidatedAssetFile } from '../validate/file-types.ts';
import { issueAt, validateSourceData } from '../validate/source-data.ts';
import { readResource, type ResourceInput } from './input.ts';
import { freezeData, type PreviewResource, type PublishedResource, type ResourceRegistry } from './types.ts';

interface CheckedResource {
  readonly input: ResourceInput;
  readonly document: ValidatedDocument;
  readonly files: readonly ValidatedAssetFile[];
}

export interface RegistryOptions {
  readonly mode?: 'public' | 'preview';
  readonly siteUrl?: string | null;
}

async function collectInputs(projectRoot: string): Promise<readonly ResourceInput[]> {
  const directories = await discoverResources(projectRoot);
  let inputs: readonly ResourceInput[] = [];
  let issues: readonly ContentIssue[] = [];
  // 顺序读取避免贡献规模增长时一次打开所有文件；只保留处理链所需数据。
  for (const directory of directories) {
    try { inputs = [...inputs, await readResource(directory)]; }
    catch (error) { issues = [...issues, ...issuesFrom(error, fileLocation(directory.id, 'index.md'))]; }
  }
  if (issues.length) throw new ContentError(issues);
  return inputs;
}

function duplicateResourceIssues(inputs: readonly ResourceInput[]): readonly ContentIssue[] {
  const first = new Map(inputs.map((input, index) => [input.metadata.id, index] as const).toReversed());
  return inputs.flatMap((input, index) => {
    const firstIndex = first.get(input.metadata.id) ?? index;
    if (firstIndex === index) return [];
    const original = inputs[firstIndex]?.metadataData.locate(['id']);
    const declaredAt = original ? `${original.file}:${original.line}:${original.column}` : '未知';
    return [issueAt(input.metadataData.locate(['id']), 'E_DUPLICATE', `重复资源 ID ${input.metadata.id}；首次声明位于 ${declaredAt}`)];
  });
}

async function checkInputs(inputs: readonly ResourceInput[], siteUrl?: string | null): Promise<readonly CheckedResource[]> {
  const resources = new Map(inputs.map((input) => [input.metadata.id, input]));
  let issues: readonly ContentIssue[] = duplicateResourceIssues(inputs);
  let checked: readonly CheckedResource[] = [];
  for (const input of inputs) {
    issues = [...issues, ...validateSourceData(input), ...validateDirectives(input, resources)];
    try {
      const document = validateDocumentLinks(input, resources, siteUrl);
      const files = await validateAssets(input, document.assets);
      checked = [...checked, { input, document, files }];
    } catch (error) { issues = [...issues, ...issuesFrom(error, input.metadataData.locate([]))]; }
  }
  if (issues.length) throw new ContentError(issues);
  return checked;
}

function publishedRecord(resource: CheckedResource): PublishedResource {
  const metadata = resource.input.metadata;
  if (metadata.draft) throw new Error('公开注册表不能包含草稿');
  const files = resource.files.filter((file) => file.referenced);
  const paths = new Set(files.map((file) => file.path));
  const data = parseSchema(sourcesSchema, {
    ...resource.input.sourceData,
    value: { ...resource.input.data, assets: resource.input.data.assets.filter((asset) => paths.has(asset.path)) },
  });
  return freezeData({ metadata, data, document: resource.document.document, files, resourceReferences: resource.document.resourceReferences });
}

function previewRecord(resource: CheckedResource): PreviewResource {
  return freezeData({
    metadata: resource.input.metadata, data: resource.input.data, document: resource.document.document,
    files: resource.files.filter((file) => file.referenced), resourceReferences: resource.document.resourceReferences,
  });
}

function makeRegistry<Resource extends PreviewResource>(resources: readonly Resource[], checked: readonly CheckedResource[], mode: 'public' | 'preview'): ResourceRegistry<Resource> {
  const index = new Map(resources.map((resource) => [resource.metadata.id, resource]));
  const publishedResources = checked.filter((resource) => !resource.input.metadata.draft).length;
  const summary = Object.freeze({
    totalResources: checked.length, publishedResources, draftResources: checked.length - publishedResources,
    selectedResources: resources.length, selectedAssetFiles: resources.reduce((count, resource) => count + resource.files.length, 0),
  });
  return Object.freeze({
    mode, resources: Object.freeze([...resources]), summary,
    get: (id: string) => index.get(id),
    referencesTo: (id: string) => Object.freeze(resources.filter((resource) => resource.resourceReferences.includes(id)).map((resource) => resource.metadata.id)),
  });
}

export function loadResourceRegistry(projectRoot: string, options?: RegistryOptions & { readonly mode?: 'public' }): Promise<ResourceRegistry<PublishedResource>>;
export function loadResourceRegistry(projectRoot: string, options: RegistryOptions & { readonly mode: 'preview' }): Promise<ResourceRegistry<PreviewResource>>;
export async function loadResourceRegistry(projectRoot: string, options: RegistryOptions = {}): Promise<ResourceRegistry<PreviewResource>> {
  const mode = options.mode ?? 'public';
  if (mode !== 'public' && mode !== 'preview') {
    throw new ContentError([{ ...fileLocation('site', ''), file: 'content/resources', code: 'E_MODE', field: 'mode', message: '注册表模式只允许 public / preview' }]);
  }
  if (mode === 'preview' && process.env.NODE_ENV === 'production') {
    throw new ContentError([{ ...fileLocation('site', ''), file: 'content/resources', code: 'E_MODE', field: 'mode', message: 'production 不允许草稿预览注册表' }]);
  }
  const checked = await checkInputs(await collectInputs(projectRoot), options.siteUrl);
  if (mode === 'preview') return makeRegistry(checked.map(previewRecord), checked, mode);
  return makeRegistry(checked.filter((resource) => !resource.input.metadata.draft).map(publishedRecord), checked, mode);
}
