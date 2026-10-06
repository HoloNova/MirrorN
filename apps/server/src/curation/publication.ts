import { CuratedDocumentSchema, type CuratedDocument } from '@mirrorn/shared';

export class CurationError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422 = 422,
  ) {
    super(message);
  }
}
export function parseDocument(raw: unknown): CuratedDocument {
  const parsed = CuratedDocumentSchema.safeParse(raw);
  if (!parsed.success)
    throw new CurationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'),
    );
  return parsed.data;
}

function ordered<T extends { order: number }>(values: readonly T[]): T[] {
  return [...values].sort((a, b) => a.order - b.order);
}

/** 只从明确标记发布的条目生成快照；引用不能偷偷跨到草稿。 */
export function publicationSnapshot(doc: CuratedDocument): CuratedDocument {
  const snapshot: CuratedDocument = {
    ...doc,
    components: doc.components.filter((entry) => entry.status === 'published'),
    versions: ordered(doc.versions.filter((entry) => entry.status === 'published')),
    resources: ordered(
      doc.resources
        .filter((entry) => entry.status === 'published')
        .map((entry) => ({ ...entry, links: entry.links.filter((link) => link.enabled) })),
    ),
    dependencies: doc.dependencies.filter((entry) => entry.status === 'published'),
    tutorials: ordered(doc.tutorials.filter((entry) => entry.status === 'published')),
  };
  parseDocument(snapshot);
  const errors: string[] = [];
  const required = (value: string, message: string) => {
    if (!value.trim()) errors.push(message);
  };
  const defaults = new Set<string>();
  for (const component of snapshot.components)
    required(component.name, `组成项 ${component.id} 缺少名称`);
  for (const version of snapshot.versions) {
    required(version.version, `版本 ${version.id} 缺少版本号`);
    if (version.recommendation !== 'none')
      required(version.reason, `版本 ${version.version} 缺少推荐理由`);
    if (version.recommendation === 'default') {
      if (defaults.has(version.componentId)) errors.push('同一组成项只能有一个默认推荐版本');
      defaults.add(version.componentId);
    }
  }
  for (const resource of snapshot.resources) {
    required(resource.title, `资源 ${resource.id} 缺少名称`);
    if (!resource.links.length || resource.links.some((link) => !link.url || !link.label))
      errors.push(`资源 ${resource.title || resource.id} 需要完整的启用来源名称和链接`);
    if (resource.kind === 'file') {
      required(resource.platform, `文件 ${resource.title} 缺少平台`);
      required(resource.arch, `文件 ${resource.title} 缺少架构（通用文件可填 any）`);
      required(resource.format, `文件 ${resource.title} 缺少格式`);
    }
  }
  for (const tutorial of snapshot.tutorials) {
    required(tutorial.title, `教程 ${tutorial.id} 缺少标题`);
    required(tutorial.markdown, `教程 ${tutorial.title || tutorial.id} 缺少正文`);
  }
  for (const dependency of snapshot.dependencies) {
    required(dependency.name, `依赖 ${dependency.id} 缺少名称`);
    if (dependency.targetEcosystemId === doc.id) errors.push('依赖目标不能引用自身生态');
  }
  if (!snapshot.resources.length && !snapshot.tutorials.length)
    errors.push('发布至少需要一个可用资源或教程');
  if (errors.length) throw new CurationError(errors.join('\n'));
  return snapshot;
}
