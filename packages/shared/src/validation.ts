import type { Ecosystem, GuideVariant, Mirror, Troubleshooting } from './schemas.js';

const TEMPLATE_VARIABLE_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g;
const KNOWN_TEMPLATE_VARIABLES = new Set(['mirrorUrl', 'packageName', 'configPath']);

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
  const ecosystemIds = new Set<string>();
  const troubleshootingIds = new Set<string>();

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
