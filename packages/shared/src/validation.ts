import type {
  Ecosystem,
  EcosystemTaxonomyEntry,
  GuideVariant,
  Mirror,
  SiteInventory,
  SiteRepositoryGroup,
  SiteResourceList,
  Troubleshooting,
  Tutorial,
} from './schemas.js';

const TEMPLATE_VARIABLE_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g;
const KNOWN_TEMPLATE_VARIABLES = new Set(['mirrorUrl', 'packageName', 'configPath']);

/**
 * 两级公共后缀列表，只用于把探针主机与镜像主页放在同一个可注册域下比较。
 * 这不是完整的公共后缀名单（那需要依赖 PSL），因此这条检查是给数据复核提个醒，
 * 不是安全边界：探针到底属于哪个机构，最终证据在 docs/probe-validation.md。
 */
const TWO_LABEL_PUBLIC_SUFFIXES = new Set([
  'edu.cn',
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'co.uk',
  'co.jp',
  'com.au',
  'co.kr',
  'com.tw',
  'com.hk',
  'com.sg',
]);

function registrableDomain(host: string): string {
  const labels = host.split('.');
  const lastName = labels.slice(-2).join('.');
  const take = TWO_LABEL_PUBLIC_SUFFIXES.has(lastName) ? 3 : 2;
  return labels.slice(-take).join('.');
}

function parseHost(value: string): string | undefined {
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

/** 探针地址必须指向镜像自己的站点，防止把第三方地址写进数据。 */
function isSameSite(probeHost: string, homepageHost: string): boolean {
  return (
    probeHost === homepageHost ||
    probeHost.endsWith(`.${homepageHost}`) ||
    homepageHost.endsWith(`.${probeHost}`) ||
    registrableDomain(probeHost) === registrableDomain(homepageHost)
  );
}

export interface Dataset {
  mirrors: Mirror[];
  ecosystems: Ecosystem[];
  troubleshooting: Troubleshooting[];
  /** 已核实的站点官方仓库目录（data/site-inventories/*.json）。 */
  siteInventories?: SiteInventory[];
  /** 审核后的生态分类（data/ecosystem-taxonomy.json）；站点资源与教程都引用它。 */
  ecosystemTaxonomy?: EcosystemTaxonomyEntry[];
  /** 每个站点官方目录的审阅归类（data/site-resources/*.json）；这是站内页面与搜索的数据源。 */
  siteResources?: SiteResourceList[];
  /** 我们自己的 Markdown 教程（data/tutorials.json）。 */
  tutorials?: Tutorial[];
  /** 历史包体抽样目录，已停用；字段保留只为让旧测试与旧数据文件仍能被校验。 */
  siteRepositories?: SiteRepositoryGroup[];
}

export interface DatasetValidationIssue {
  path: string;
  message: string;
}

function addIssue(issues: DatasetValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function collectTemplateValues(guide: GuideVariant): Array<{ path: string; value: string }> {
  const values: Array<{ path: string; value: string }> = [];
  const add = (path: string, value: string | undefined): void => {
    if (value !== undefined) {
      values.push({ path, value });
    }
  };

  add('temporary.command', guide.temporary?.command);
  add('persistent.command', guide.persistent?.command);
  add('configFile.path', guide.configFile?.path);
  add('configFile.content', guide.configFile?.content);
  add('verification.command', guide.verification.command);
  add('restore.command', guide.restore.command);

  return values;
}

function validateGuideTemplates(
  guide: GuideVariant,
  path: string,
  issues: DatasetValidationIssue[],
): void {
  const declaredVariables = new Set(guide.variables);

  for (const { path: valuePath, value } of collectTemplateValues(guide)) {
    for (const match of value.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
      const variable = match[1];
      if (!KNOWN_TEMPLATE_VARIABLES.has(variable)) {
        addIssue(issues, `${path}.${valuePath}`, `使用了未知模板变量 {{${variable}}}`);
      } else if (!declaredVariables.has(variable as GuideVariant['variables'][number])) {
        addIssue(issues, `${path}.${valuePath}`, `模板变量 {{${variable}}} 未在 variables 中声明`);
      }
    }
  }
}

export function validateDataset(dataset: Dataset): DatasetValidationIssue[] {
  const issues: DatasetValidationIssue[] = [];
  const mirrorIds = new Set<string>();
  const probeIds = new Set<string>();
  const ecosystemIds = new Set<string>();
  const troubleshootingIds = new Set<string>();
  const guidedPairs = new Set<string>();
  const guidedSites = new Set<string>();
  // 目录已核验但尚无可用配置/还原向导的协议；不因此生成空的生态页。
  const directoryOnlyEcosystems = new Set(['go', 'maven', 'cargo', 'debian', 'alpine']);

  // 生态数据里已经审核过的仓库主机，可以作为探针地址的第二个合法来源：
  // npm 官方 registry（registry.npmjs.org）与它的主页（www.npmjs.com）并不是同一个域。
  const repositoryHosts = new Map<string, Set<string>>();
  for (const ecosystem of dataset.ecosystems) {
    for (const support of ecosystem.supports) {
      const host = parseHost(support.repositoryUrl);
      if (!host) {
        continue;
      }
      const hosts = repositoryHosts.get(support.mirrorId) ?? new Set<string>();
      hosts.add(host);
      repositoryHosts.set(support.mirrorId, hosts);
    }
  }

  dataset.mirrors.forEach((mirror, index) => {
    const path = `mirrors[${index}]`;
    if (mirrorIds.has(mirror.id)) {
      addIssue(issues, `${path}.id`, `镜像 ID 重复：${mirror.id}`);
    }
    mirrorIds.add(mirror.id);

    if (mirror.homepageUrl.startsWith('http://')) {
      addIssue(issues, `${path}.homepageUrl`, '镜像主页必须使用 HTTPS');
    }
    if (mirror.probe?.url.startsWith('http://')) {
      addIssue(issues, `${path}.probe.url`, '探测地址必须使用 HTTPS');
    }

    const probe = mirror.probe;
    if (probe) {
      if (probeIds.has(probe.id)) {
        addIssue(issues, `${path}.probe.id`, `探针 ID 重复：${probe.id}`);
      }
      probeIds.add(probe.id);

      const probeHost = parseHost(probe.url);
      const homepageHost = parseHost(mirror.homepageUrl);
      const declaredHosts = repositoryHosts.get(mirror.id);
      const allowed =
        probeHost === undefined ||
        (homepageHost !== undefined && isSameSite(probeHost, homepageHost)) ||
        declaredHosts?.has(probeHost) === true;

      if (probeHost && !allowed) {
        addIssue(
          issues,
          `${path}.probe.url`,
          `探针地址必须是镜像主页的主机、同一站点，或该镜像在生态数据里已声明的仓库主机；当前为 ${probeHost}`,
        );
      }
    }
  });

  dataset.ecosystems.forEach((ecosystem, ecosystemIndex) => {
    const ecosystemPath = `ecosystems[${ecosystemIndex}]`;
    if (ecosystemIds.has(ecosystem.id)) {
      addIssue(issues, `${ecosystemPath}.id`, `生态 ID 重复：${ecosystem.id}`);
    }
    ecosystemIds.add(ecosystem.id);

    ecosystem.supports.forEach((support, supportIndex) => {
      const supportPath = `${ecosystemPath}.supports[${supportIndex}]`;
      if (support.ecosystemId !== ecosystem.id) {
        addIssue(issues, `${supportPath}.ecosystemId`, `必须与所属生态 ID 一致：${ecosystem.id}`);
      }
      if (!mirrorIds.has(support.mirrorId)) {
        addIssue(issues, `${supportPath}.mirrorId`, `引用了不存在的镜像：${support.mirrorId}`);
      }
      if (support.repositoryUrl.startsWith('http://')) {
        addIssue(issues, `${supportPath}.repositoryUrl`, '仓库地址必须使用 HTTPS');
      }
      const key = `${support.mirrorId}|${ecosystem.id}`;
      if (guidedPairs.has(key)) {
        addIssue(issues, supportPath, `同站同生态的可配置来源重复：${key}`);
      }
      guidedPairs.add(key);
      guidedSites.add(support.mirrorId);
    });

    const guideIds = new Set<string>();
    ecosystem.guides.forEach((guide, guideIndex) => {
      const guidePath = `${ecosystemPath}.guides[${guideIndex}]`;
      if (guideIds.has(guide.id)) {
        addIssue(issues, `${guidePath}.id`, `向导变体 ID 重复：${guide.id}`);
      }
      guideIds.add(guide.id);
      validateGuideTemplates(guide, guidePath, issues);
    });

    // 同一（系统, 终端）下，要么全部按版本区分，要么都不区分：
    // 混写会让不声明版本的模板永远选不到（选版本时它不匹配，不选版本时又整体报歧义）。
    const byPlatform = new Map<string, GuideVariant[]>();
    for (const guide of ecosystem.guides) {
      const key = `${guide.os}|${guide.shell}`;
      byPlatform.set(key, [...(byPlatform.get(key) ?? []), guide]);
    }

    for (const [key, guides] of byPlatform) {
      const withVersion = guides.filter((guide) => guide.version !== undefined);
      const withoutVersion = guides.filter((guide) => guide.version === undefined);
      const label = key.replace('|', '/');

      if (withVersion.length > 0 && withoutVersion.length > 0) {
        addIssue(
          issues,
          `${ecosystemPath}.guides`,
          `${label} 下混用了带版本与不带版本的模板（${guides
            .map((guide) => guide.id)
            .join('、')}），必须统一`,
        );
        continue;
      }

      if (withVersion.length === 0) {
        continue;
      }

      const seenVersions = new Map<string, string>();
      for (const guide of withVersion) {
        const version = guide.version ?? '';
        const existing = seenVersions.get(version);
        if (existing !== undefined) {
          addIssue(
            issues,
            `${ecosystemPath}.guides`,
            `${label} 下版本 ${version} 出现多次（${existing}、${guide.id}），无法确定使用哪一个`,
          );
          continue;
        }
        seenVersions.set(version, guide.id);

        // 版本是给用户看的标签，必须同时说明是哪个发行版，否则界面无法解释“24.04 指的是什么”。
        if (guide.distribution === undefined) {
          addIssue(
            issues,
            `${ecosystemPath}.guides`,
            `模板 ${guide.id} 声明了 version（${version}）但未声明 distribution`,
          );
        }
      }
    }
  });

  // 目录层：对站点官方公布的仓库目录做引用与同源校验。官方目录本身不承诺每个仓库可用，
  // 它不是配置向导，也不是包体抽样记录。
  const inventorySites = new Set<string>();
  for (const [inventoryIndex, inventory] of (dataset.siteInventories ?? []).entries()) {
    const inventoryPath = `siteInventories[${inventoryIndex}]`;
    if (!mirrorIds.has(inventory.siteId)) {
      addIssue(issues, `${inventoryPath}.siteId`, `引用了不存在的镜像：${inventory.siteId}`);
    }
    if (inventorySites.has(inventory.siteId)) {
      addIssue(issues, `${inventoryPath}.siteId`, `站点官方目录重复：${inventory.siteId}`);
    }
    inventorySites.add(inventory.siteId);

    const sourceHost = parseHost(inventory.sourceUrl);
    const homepage = dataset.mirrors.find((mirror) => mirror.id === inventory.siteId)?.homepageUrl;
    const homepageHost = homepage === undefined ? undefined : parseHost(homepage);
    if (
      sourceHost !== undefined &&
      homepageHost !== undefined &&
      !isSameSite(sourceHost, homepageHost)
    ) {
      addIssue(
        issues,
        `${inventoryPath}.sourceUrl`,
        `官方目录入口必须是镜像自己站点上的地址；当前为 ${sourceHost}，主页为 ${homepageHost}`,
      );
    }
  }

  // 审阅归类：站内页面、筛选与搜索都读它，因此三条引用必须闭合。
  const taxonomyIds = new Set((dataset.ecosystemTaxonomy ?? []).map((entry) => entry.id));
  const tutorialIds = new Set((dataset.tutorials ?? []).map((entry) => entry.id));
  const classifiedSites = new Set<string>();
  for (const [listIndex, list] of (dataset.siteResources ?? []).entries()) {
    const listPath = `siteResources[${listIndex}]`;
    if (!mirrorIds.has(list.siteId)) {
      addIssue(issues, `${listPath}.siteId`, `引用了不存在的镜像：${list.siteId}`);
    }
    if (classifiedSites.has(list.siteId)) {
      addIssue(issues, `${listPath}.siteId`, `站点资源归类重复：${list.siteId}`);
    }
    classifiedSites.add(list.siteId);

    const inventory = (dataset.siteInventories ?? []).find((entry) => entry.siteId === list.siteId);
    const inventoryIds = new Set(inventory?.repositories.map((repository) => repository.id) ?? []);
    const homepage = dataset.mirrors.find((mirror) => mirror.id === list.siteId)?.homepageUrl;
    const homepageHost = homepage === undefined ? undefined : parseHost(homepage);

    for (const [resourceIndex, resource] of list.resources.entries()) {
      const resourcePath = `${listPath}.resources[${resourceIndex}]`;
      if (!taxonomyIds.has(resource.ecosystemId)) {
        addIssue(
          issues,
          `${resourcePath}.ecosystemId`,
          `引用了未定义的生态：${resource.ecosystemId}（先在 data/ecosystem-taxonomy.json 里定义）`,
        );
      }
      if (resource.tutorialId !== null && !tutorialIds.has(resource.tutorialId)) {
        addIssue(
          issues,
          `${resourcePath}.tutorialId`,
          `引用了不存在的教程：${resource.tutorialId}（见 data/tutorials.json）`,
        );
      }
      if (inventory !== undefined && !inventoryIds.has(resource.id)) {
        addIssue(issues, `${resourcePath}.id`, `官方目录里没有这条仓库：${resource.id}`);
      }
      // PKU /files/ 目录适配器拼接相对路径，入口必须指向以 / 结尾的目录。
      if (list.siteId === 'pku' && !resource.downloadEntry.endsWith('/')) {
        addIssue(issues, `${resourcePath}.downloadEntry`, '北大文件目录入口必须以 / 结尾');
      }
      // 下载入口必须是镜像站自己的地址：站内页面不能让用户不知不觉跳到第三方。
      for (const [field, value] of [
        ['downloadEntry', resource.downloadEntry],
        ['helpDocUrl', resource.helpDocUrl],
      ] as const) {
        const host = value === null ? undefined : parseHost(value);
        if (host !== undefined && homepageHost !== undefined && !isSameSite(host, homepageHost)) {
          addIssue(
            issues,
            `${resourcePath}.${field}`,
            `必须是镜像自己站点上的地址；当前为 ${host}`,
          );
        }
      }
    }

    // 官方目录与归类必须一一对应：漏掉一条，站内页面就会少一个可下载的资源。
    if (inventory !== undefined) {
      const classified = new Set(list.resources.map((resource) => resource.id));
      for (const repository of inventory.repositories) {
        if (!classified.has(repository.id)) {
          addIssue(issues, `${listPath}.resources`, `官方目录里的仓库缺少归类：${repository.id}`);
        }
      }
    }
  }

  for (const [tutorialIndex, tutorial] of (dataset.tutorials ?? []).entries()) {
    for (const ecosystemId of tutorial.ecosystemIds) {
      if (!taxonomyIds.has(ecosystemId)) {
        addIssue(
          issues,
          `tutorials[${tutorialIndex}].ecosystemIds`,
          `教程引用了未定义的生态：${ecosystemId}`,
        );
      }
    }
  }

  // 目录层是站点优先的静态抽查；不与可配置向导维护同一份仓库 URL。
  const directorySites = new Set<string>();
  dataset.siteRepositories?.forEach((group, groupIndex) => {
    const groupPath = `siteRepositories[${groupIndex}]`;
    if (!mirrorIds.has(group.siteId)) {
      addIssue(issues, `${groupPath}.siteId`, `引用了不存在的镜像：${group.siteId}`);
    }
    if (directorySites.has(group.siteId)) {
      addIssue(issues, `${groupPath}.siteId`, `站点仓库分组重复：${group.siteId}`);
    }
    directorySites.add(group.siteId);

    const seenRepositoryIds = new Set<string>();
    const seenAddresses = new Set<string>();
    group.repositories.forEach((repository, repoIndex) => {
      const repoPath = `${groupPath}.repositories[${repoIndex}]`;
      const key = `${group.siteId}|${repository.ecosystemId}`;
      if (seenRepositoryIds.has(repository.id)) {
        addIssue(issues, `${repoPath}.id`, `站点仓库 ID 重复：${group.siteId}|${repository.id}`);
      }
      seenRepositoryIds.add(repository.id);
      const address = `${repository.ecosystemId}|${repository.repositoryUrl}`;
      if (seenAddresses.has(address)) {
        addIssue(issues, `${repoPath}.repositoryUrl`, `仓库地址重复：${key}`);
      }
      seenAddresses.add(address);
      if (guidedPairs.has(key)) {
        addIssue(issues, `${repoPath}.ecosystemId`, `已经在生态向导中维护：${key}`);
      }
      if (
        !ecosystemIds.has(repository.ecosystemId) &&
        !directoryOnlyEcosystems.has(repository.ecosystemId)
      ) {
        addIssue(issues, `${repoPath}.ecosystemId`, `未知生态：${repository.ecosystemId}`);
      }
    });
  });

  // 站点收录不再要求“已核实仓库”：新主线里站点先收录官方入口，仓库目录逐站核实（site-inventories），
  // 不在目录的站点在界面上明确标为待整理，而不是拿抽样记录充当清单。
  // 每个站点至少要有 sources 这一条由 MirrorSchema 保证（官方入口已核对于 checkedAt）。

  // 状态源：与探针同样的“必须属于镜像自己”的约束，另外要求上游声明的作业名存在。
  const statusJobs = new Map<string, { mirrorId: string; ecosystemId: string; path: string }>();
  const statusSourceUrls = new Map<string, string>();
  dataset.mirrors.forEach((mirror, index) => {
    const source = mirror.statusSource;
    if (!source) {
      return;
    }
    const path = `mirrors[${index}].statusSource`;
    const sourceHost = parseHost(source.url);
    const homepageHost = parseHost(mirror.homepageUrl);
    if (
      sourceHost !== undefined &&
      homepageHost !== undefined &&
      !isSameSite(sourceHost, homepageHost)
    ) {
      addIssue(
        issues,
        `${path}.url`,
        `状态文件必须是镜像自己站点上的地址；当前为 ${sourceHost}，主页为 ${homepageHost}`,
      );
    }
    statusSourceUrls.set(mirror.id, source.url);
  });

  dataset.ecosystems.forEach((ecosystem, ecosystemIndex) => {
    ecosystem.supports.forEach((support, supportIndex) => {
      if (support.statusJob === undefined) {
        return;
      }
      const path = `ecosystems[${ecosystemIndex}].supports[${supportIndex}].statusJob`;
      const sourceUrl = statusSourceUrls.get(support.mirrorId);
      if (sourceUrl === undefined) {
        addIssue(
          issues,
          path,
          `镜像 ${support.mirrorId} 没有声明 statusSource，不能指定 statusJob`,
        );
        return;
      }
      const key = `${sourceUrl}#${support.statusJob}`;
      const existing = statusJobs.get(key);
      if (existing) {
        addIssue(
          issues,
          path,
          `同一个状态文件里的作业名 ${support.statusJob} 被 ${existing.mirrorId}/${existing.ecosystemId} 与 ${support.mirrorId}/${support.ecosystemId} 同时占用`,
        );
        return;
      }
      statusJobs.set(key, {
        mirrorId: support.mirrorId,
        ecosystemId: support.ecosystemId,
        path,
      });
    });
  });

  dataset.troubleshooting.forEach((entry, index) => {
    const path = `troubleshooting[${index}]`;
    if (troubleshootingIds.has(entry.id)) {
      addIssue(issues, `${path}.id`, `排错条目 ID 重复：${entry.id}`);
    }
    troubleshootingIds.add(entry.id);

    if (!ecosystemIds.has(entry.ecosystemId)) {
      addIssue(issues, `${path}.ecosystemId`, `引用了不存在的生态：${entry.ecosystemId}`);
    }
  });

  dataset.ecosystems.forEach((ecosystem, index) => {
    const covered = dataset.troubleshooting.some((entry) => entry.ecosystemId === ecosystem.id);
    if (!covered) {
      addIssue(issues, `ecosystems[${index}].id`, `生态 ${ecosystem.id} 没有对应的排错条目`);
    }
  });

  return issues;
}
