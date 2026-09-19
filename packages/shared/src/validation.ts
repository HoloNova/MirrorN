import type { Ecosystem, GuideVariant, Mirror, Troubleshooting } from './schemas.js';

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
