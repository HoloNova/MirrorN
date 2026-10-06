import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DownloadManifestSchema,
  DownloadRuleSchema,
  DownloadBindingSchema,
  DownloadTemplateSchema,
  SoftwareIdentitySchema,
  EcosystemTaxonomySchema,
  SiteResourceListSchema,
  type DownloadRule,
  type DownloadBinding,
  type SoftwareIdentity,
  TunaCatalogConfigSchema,
  type TunaCatalogConfig,
  VersionPolicySchema,
  type VersionPolicy,
} from '@mirrorn/shared';
import { sourceUrl, resourceSite } from '../policy.js';

export interface RuleSet {
  readonly revision: string;
  readonly identities: readonly SoftwareIdentity[];
  readonly rules: ReadonlyMap<string, DownloadRule>;
  readonly bindings: ReadonlyMap<string, DownloadBinding>;
  readonly active: readonly DownloadBinding[];
  readonly officialCatalog?: TunaCatalogConfig;
  readonly versionPolicy?: VersionPolicy;
}
// tsx开发线程的模块URL带命名空间查询参数，先转文件路径再判断扩展名。
const modulePath = fileURLToPath(import.meta.url);
const here = dirname(modulePath);
const bundled = ['server.js', 'index-worker.js'].includes(basename(modulePath));
export const defaultRuleDataDir = bundled
  ? resolve(here, '../data')
  : resolve(here, '../../../../../data');
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function unique<T>(rows: T[], key: (value: T) => string, label: string) {
  const result = new Map<string, T>();
  for (const row of rows) {
    const id = key(row);
    if (result.has(id)) throw new Error(`${label}重复：${id}`);
    result.set(id, freeze(row));
  }
  return result;
}

/** 启动时一次性加载。缺失/非法配置抛错，由后台生命周期暂停采集，查询不用规则。 */
export function loadDownloadRules(dataDir = defaultRuleDataDir): RuleSet {
  const input: unknown[] = [];
  function json(path: string): unknown {
    const value: unknown = JSON.parse(readFileSync(resolve(dataDir, path), 'utf8'));
    input.push(value);
    return value;
  }
  const manifest = DownloadManifestSchema.parse(json('download-rules/manifest.json'));
  const officialCatalog = manifest.officialCatalog
    ? TunaCatalogConfigSchema.parse(json(`download-rules/${manifest.officialCatalog}`))
    : undefined;
  // 同一生态跨源站共用的推荐版本策略；缺省时不限制，采集与清理都按未配置处理。
  const versionPolicy = manifest.versionPolicy
    ? VersionPolicySchema.parse(json(`download-rules/${manifest.versionPolicy}`))
    : undefined;
  const templates = unique(
    DownloadTemplateSchema.array().parse(json(`download-rules/${manifest.templates}`)),
    (r) => r.id,
    '模板',
  );
  const identities = SoftwareIdentitySchema.array().parse(json('software.json'));
  const identityMap = unique(identities, (r) => r.slug, '软件身份');
  unique(identities, (r) => r.resourceKey, '公开资源标识');
  const rules = unique(
    DownloadRuleSchema.array().parse(json(`download-rules/${manifest.rules}`)),
    (r) => r.id,
    '软件规则',
  );
  const sources = new Map<string, ReturnType<typeof SiteResourceListSchema.parse>>();
  const bindingRows = manifest.bindings.flatMap((path) => {
    const siteId = basename(path, '.json');
    resourceSite(siteId);
    const list = SiteResourceListSchema.parse(json(`site-resources/${siteId}.json`));
    if (list.siteId !== siteId) throw new Error(`仓库清单所属站点不一致：${path}`);
    unique(list.resources, (r) => r.id, `${siteId}仓库`);
    sources.set(siteId, list);
    const rows = DownloadBindingSchema.array().parse(json(`download-rules/${path}`));
    if (rows.some((b) => b.siteId !== siteId || !b.id.startsWith(`${siteId}-`)))
      throw new Error(`绑定所属站点不一致：${path}`);
    return rows;
  });
  const bindings = unique(bindingRows, (r) => r.id, '站点绑定');
  const taxonomy = EcosystemTaxonomySchema.parse(json('ecosystem-taxonomy.json'));
  const ecos = new Set(taxonomy.map((r) => r.id));
  for (const identity of identities) {
    if (
      !ecos.has(identity.ecosystemId) ||
      ![...sources.values()].some((list) =>
        list.resources.some(
          (repo) => repo.id === identity.repo && repo.ecosystemId === identity.ecosystemId,
        ),
      )
    )
      throw new Error(`软件生态/仓库引用无效：${identity.slug}`);
  }
  const allowedCaptures = new Set([
    'version',
    'releaseDate',
    'format',
    'platform',
    'arch',
    'variant',
    'edition',
    'build',
    'series',
    'revision',
    'software',
    'scalaBuild',
    'pythonMajor',
    'pythonBuild',
    'buildVariant',
  ]);
  for (const rule of rules.values()) {
    if (!templates.has(rule.templateId)) throw new Error(`模板未实现：${rule.templateId}`);
    for (const id of rule.softwareIds)
      if (!identityMap.has(id)) throw new Error(`软件未登记：${id}`);
    unique(rule.matches, (m) => m.id, `规则${rule.id}匹配项`);
    for (const match of rule.matches) {
      const groups = [...match.pattern.matchAll(/\(\?<([A-Za-z][A-Za-z0-9]*)>/g)].map((m) => m[1]!);
      if (groups.some((name) => !allowedCaptures.has(name)) || !groups.includes('format'))
        throw new Error(`捕获字段未实现：${rule.id}/${match.id}`);
      if (match.platformCapture && !groups.includes(match.platformCapture))
        throw new Error(`平台捕获组不存在：${rule.id}/${match.id}`);
      if (
        !groups.includes('version') &&
        !groups.includes('releaseDate') &&
        !['texlive', 'rtools'].includes(match.parser)
      )
        throw new Error(`缺少版本来源：${rule.id}/${match.id}`);
      if (rule.softwareIds.length > 1 && !groups.includes('software'))
        throw new Error(`多软件规则缺少身份捕获：${rule.id}`);
    }
  }
  for (const binding of bindings.values()) {
    const rule = rules.get(binding.ruleId);
    const repo = sources.get(binding.siteId)?.resources.find((r) => r.id === binding.repoId);
    if (!rule || !repo) throw new Error(`绑定引用无效：${binding.id}`);
    if (
      !binding.rootPath.startsWith(`${binding.repoId}/`) ||
      !binding.rootPath.endsWith('/') ||
      /[?#%\\]|(?:^|\/)\.{1,2}(?:\/|$)/.test(binding.rootPath) ||
      /(?:^|\/)v?\d+\.\d+(?:\.\d+)*(?:\/|$)/.test(binding.rootPath)
    )
      throw new Error(`绑定必须为审核的动态发布根：${binding.id}`);
    const origin = resourceSite(binding.siteId).origin;
    const url = sourceUrl(`${origin}/${binding.rootPath}`, `${origin}/${binding.repoId}/`);
    if (url.search || binding.steps.length > templates.get(rule.templateId)!.maxDepth)
      throw new Error(`目录深度异常：${binding.id}`);
    for (const id of rule.softwareIds)
      if (identityMap.get(id)!.ecosystemId !== repo.ecosystemId)
        throw new Error(`软件与站点仓库生态不一致：${binding.id}`);
    new RegExp(binding.leaf);
    binding.steps.forEach((pattern) => new RegExp(pattern));
  }
  if (officialCatalog) {
    if (!sources.has('tsinghua')) throw new Error('官方清单必须登记清华来源');
    const mapped = new Set<string>();
    for (const binding of officialCatalog.bindings) {
      const software = identityMap.get(binding.softwareId);
      if (!software) throw new Error(`官方清单软件未登记：${binding.softwareId}`);
      for (const root of binding.roots) {
        if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(root)) throw new Error(`官方清单路径异常：${root}`);
        const repo = sources.get('tsinghua')!.resources.find((r) => r.id === root.split('/')[0]);
        if (!repo || repo.ecosystemId !== software.ecosystemId)
          throw new Error(`官方清单仓库/生态不一致：${binding.softwareId}/${root}`);
        sourceUrl(
          `https://mirrors.tuna.tsinghua.edu.cn/${root}`,
          'https://mirrors.tuna.tsinghua.edu.cn/',
        );
        const key = `${binding.group}:${root}:${binding.filename ?? '*'}`;
        if (mapped.has(key)) throw new Error(`官方清单映射重复：${key}`);
        mapped.add(key);
      }
    }
    if (
      officialCatalog.excludedGroups.some((g) =>
        officialCatalog.bindings.some((b) => b.group === g.group),
      )
    )
      throw new Error('官方清单分组不能同时接入和排除');
  }
  // 配置与执行代码共同决定版本；打包后主进程和采集线程使用同一worker文件。
  const code = bundled
    ? [readFileSync(resolve(here, 'index-worker.js'), 'utf8')]
    : [
        'load',
        'classify',
        'normalize',
        'templates',
        'pending',
        '../installers',
        '../source',
        '../directory',
        '../policy',
        '../versions',
        '../recommendations',
        '../../db/installers',
        '../../db/downloadSources',
        '../../db/versionPolicy',
        '../tuna/catalog',
        '../tuna/normalize',
        '../tuna/import',
      ].map((name) =>
        readFileSync(resolve(here, `${name}${modulePath.endsWith('.ts') ? '.ts' : '.js'}`), 'utf8'),
      );
  const revision = createHash('sha256')
    .update(JSON.stringify(input))
    .update(code.join('\n'))
    .digest('hex');
  return Object.freeze({
    revision,
    ...(officialCatalog ? { officialCatalog: freeze(officialCatalog) } : {}),
    ...(versionPolicy ? { versionPolicy: freeze(versionPolicy) } : {}),
    identities: freeze(identities),
    rules,
    bindings,
    active: freeze([...bindings.values()].filter((b) => rules.get(b.ruleId)!.status === 'active')),
  });
}

/** 软件身份不因新增非目录来源而误判为ISO；空规则集合也不是ISO证据。 */
export function softwareKind(set: RuleSet, software: string): 'iso' | 'installer' {
  const purposes = [
    ...[...set.rules.values()]
      .filter((rule) => rule.softwareIds.includes(software))
      .flatMap((rule) => rule.matches.map((match) => match.purpose)),
    ...(set.officialCatalog?.bindings
      .filter((binding) => binding.softwareId === software)
      .map((binding) => binding.purpose) ?? []),
  ];
  return purposes.length > 0 && purposes.every((purpose) => purpose === 'system_image')
    ? 'iso'
    : 'installer';
}
