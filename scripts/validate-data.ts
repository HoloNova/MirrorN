import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EcosystemSchema,
  EcosystemTaxonomySchema,
  MirrorListSchema,
  SiteInventorySchema,
  SiteResourceListSchema,
  TroubleshootingListSchema,
  TutorialListSchema,
  validateDataset,
  type Ecosystem,
  type EcosystemTaxonomyEntry,
  type Mirror,
  type SiteInventory,
  type SiteResourceList,
  type Troubleshooting,
  type Tutorial,
} from '@mirrorn/shared';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataRoot = resolve(projectRoot, 'data');

interface JsonFile {
  path: string;
  value: unknown;
}

const problems: string[] = [];

function reportProblem(message: string): void {
  problems.push(message);
  console.error(message);
}

function printZodIssues(
  path: string,
  error: { issues: Array<{ path: PropertyKey[]; message: string }> },
): void {
  for (const issue of error.issues) {
    const issuePath = issue.path.length > 0 ? `${path}:${issue.path.join('.')}` : path;
    reportProblem(`${issuePath}：${issue.message}`);
  }
}

/** 读取目录下所有 JSON 文件；解析失败的文件会被记录，不会中断其余文件的检查。 */
async function readJsonFiles(directory: string, label: string): Promise<JsonFile[]> {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  const result: JsonFile[] = [];

  if (files.length === 0) {
    reportProblem(`${label} 下没有任何 JSON 数据文件。`);
    return result;
  }

  for (const file of files) {
    const path = `${label}/${file}`;
    try {
      const content = await readFile(resolve(directory, file), 'utf8');
      result.push({ path, value: JSON.parse(content) as unknown });
    } catch (error) {
      reportProblem(`${path}：无法解析 JSON（${(error as Error).message}）`);
    }
  }

  return result;
}

async function main(): Promise<void> {
  const mirrorsPath = 'data/mirrors.json';
  let mirrorsValue: unknown;
  try {
    mirrorsValue = JSON.parse(await readFile(resolve(dataRoot, 'mirrors.json'), 'utf8')) as unknown;
  } catch (error) {
    reportProblem(`${mirrorsPath}：无法解析 JSON（${(error as Error).message}）`);
  }

  const inventoryFiles = await readJsonFiles(
    resolve(dataRoot, 'site-inventories'),
    'data/site-inventories',
  );
  const resourceFiles = await readJsonFiles(
    resolve(dataRoot, 'site-resources'),
    'data/site-resources',
  );
  const ecosystemFiles = await readJsonFiles(resolve(dataRoot, 'ecosystems'), 'data/ecosystems');
  const troubleshootingFiles = await readJsonFiles(
    resolve(dataRoot, 'troubleshooting'),
    'data/troubleshooting',
  );

  const mirrorsResult = MirrorListSchema.safeParse(mirrorsValue);
  const mirrors: Mirror[] = mirrorsResult.success ? mirrorsResult.data : [];
  if (!mirrorsResult.success) {
    printZodIssues(mirrorsPath, mirrorsResult.error);
  }

  const inventories: SiteInventory[] = [];
  for (const file of inventoryFiles) {
    const result = SiteInventorySchema.safeParse(file.value);
    if (result.success) {
      inventories.push(result.data);
    } else {
      printZodIssues(file.path, result.error);
    }
  }

  const resourceLists: SiteResourceList[] = [];
  for (const file of resourceFiles) {
    const result = SiteResourceListSchema.safeParse(file.value);
    if (result.success) {
      resourceLists.push(result.data);
    } else {
      printZodIssues(file.path, result.error);
    }
  }

  let taxonomy: EcosystemTaxonomyEntry[] = [];
  try {
    const value: unknown = JSON.parse(
      await readFile(resolve(dataRoot, 'ecosystem-taxonomy.json'), 'utf8'),
    );
    const result = EcosystemTaxonomySchema.safeParse(value);
    if (result.success) {
      taxonomy = result.data;
    } else {
      printZodIssues('data/ecosystem-taxonomy.json', result.error);
    }
  } catch (error) {
    reportProblem(`data/ecosystem-taxonomy.json：无法解析 JSON（${(error as Error).message}）`);
  }

  let tutorials: Tutorial[] = [];
  try {
    const value: unknown = JSON.parse(await readFile(resolve(dataRoot, 'tutorials.json'), 'utf8'));
    const result = TutorialListSchema.safeParse(value);
    if (result.success) {
      tutorials = result.data;
    } else {
      printZodIssues('data/tutorials.json', result.error);
    }
  } catch (error) {
    reportProblem(`data/tutorials.json：无法解析 JSON（${(error as Error).message}）`);
  }

  // 教程正文是仓库里的 Markdown：清单与文件必须一致，否则页面会拿到空正文。
  for (const tutorial of tutorials) {
    const file = resolve(projectRoot, 'apps/web/src/tutorials', tutorial.file);
    try {
      const body = await readFile(file, 'utf8');
      if (!body.startsWith('# ')) {
        reportProblem(`apps/web/src/tutorials/${tutorial.file}：教程正文必须以一级标题开头`);
      }
    } catch {
      reportProblem(`data/tutorials.json：教程文件不存在 apps/web/src/tutorials/${tutorial.file}`);
    }
  }

  const ecosystems: Ecosystem[] = [];
  for (const file of ecosystemFiles) {
    const result = EcosystemSchema.safeParse(file.value);
    if (result.success) {
      ecosystems.push(result.data);
    } else {
      printZodIssues(file.path, result.error);
    }
  }

  const troubleshooting: Troubleshooting[] = [];
  for (const file of troubleshootingFiles) {
    const result = TroubleshootingListSchema.safeParse(file.value);
    if (result.success) {
      troubleshooting.push(...result.data);
    } else {
      printZodIssues(file.path, result.error);
    }
  }

  // schema 层面的问题优先报告，避免引用完整性检查在残缺数据上产生噪音。
  if (problems.length > 0) {
    process.exitCode = 1;
    return;
  }

  const issues = validateDataset({
    mirrors,
    ecosystems,
    troubleshooting,
    siteInventories: inventories,
    ecosystemTaxonomy: taxonomy,
    siteResources: resourceLists,
    tutorials,
  });
  if (issues.length > 0) {
    for (const issue of issues) {
      reportProblem(`${issue.path}：${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `数据校验通过：${mirrors.length} 个镜像，${inventories.length} 份官方站点目录（共 ${inventories.reduce((sum, inventory) => sum + inventory.repositories.length, 0)} 条仓库），${resourceLists.reduce((sum, list) => sum + list.resources.length, 0)} 条资源归类，${taxonomy.length} 个生态，${tutorials.length} 篇教程，${troubleshooting.length} 条排错。`,
  );
}

await main();
