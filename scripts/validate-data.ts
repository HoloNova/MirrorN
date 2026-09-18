import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EcosystemSchema,
  MirrorListSchema,
  TroubleshootingListSchema,
  validateDataset,
  type Ecosystem,
  type Mirror,
  type Troubleshooting,
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

  const issues = validateDataset({ mirrors, ecosystems, troubleshooting });
  if (issues.length > 0) {
    for (const issue of issues) {
      reportProblem(`${issue.path}：${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `数据校验通过：${mirrors.length} 个镜像，${ecosystems.length} 个生态，${troubleshooting.length} 条排错。`,
  );
}

await main();
