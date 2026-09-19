import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { EcosystemSchema, MirrorListSchema, type Ecosystem, type Mirror } from '@mirrorn/shared';
import type { SyncSourceKind } from '@mirrorn/shared/sync';

/**
 * 从仓库里的声明式数据推导“要抓哪些上游状态文件、文件里哪些作业对应哪个（镜像, 生态）”。
 *
 * 为什么运行时读 `data/` 而不是构建期生成代码：前端打包的是同一份 JSON，服务端读同一份 JSON
 * 就不会出现“前端认为有状态源、后端不知道”的漂移；数据已经过 `pnpm validate:data`，这里再用
 * 同一套 schema 校验一次，保证未校验的数据进不了服务端。
 */

export interface StatusJobDefinition {
  mirrorId: string;
  ecosystemId: string;
  /** 上游文件里的作业名，例如 tunasync 的 `pypi`。 */
  job: string;
}

export interface StatusSourceDefinition {
  kind: SyncSourceKind;
  url: string;
  jobs: StatusJobDefinition[];
}

export interface StatusSourcesResult {
  sources: StatusSourceDefinition[];
  diagnostics: string[];
}

export interface LoadStatusSourcesOptions {
  dataDir: string;
  readFileImpl?: (path: string) => Promise<string>;
  readDirImpl?: (path: string) => Promise<string[]>;
}

export async function loadStatusSources(
  options: LoadStatusSourcesOptions,
): Promise<StatusSourcesResult> {
  const read = options.readFileImpl ?? ((path: string) => readFile(path, 'utf8'));
  const readDir = options.readDirImpl ?? ((path: string) => readdir(path));
  const diagnostics: string[] = [];

  const mirrors: Mirror[] = MirrorListSchema.parse(
    JSON.parse(await read(join(options.dataDir, 'mirrors.json'))),
  );
  const mirrorById = new Map(mirrors.map((mirror) => [mirror.id, mirror]));

  const ecosystemDir = join(options.dataDir, 'ecosystems');
  const ecosystemFiles = (await readDir(ecosystemDir))
    .filter((file) => file.endsWith('.json'))
    .sort();

  const ecosystems: Ecosystem[] = [];
  for (const file of ecosystemFiles) {
    ecosystems.push(
      EcosystemSchema.parse(JSON.parse(await read(join(ecosystemDir, file)))) as Ecosystem,
    );
  }

  const byUrl = new Map<string, StatusSourceDefinition>();

  for (const ecosystem of ecosystems) {
    for (const support of ecosystem.supports) {
      if (support.statusJob === undefined) {
        continue;
      }

      const source = mirrorById.get(support.mirrorId)?.statusSource;
      if (!source) {
        diagnostics.push(
          `生态 ${ecosystem.id} 的 ${support.mirrorId} 声明了 statusJob 但镜像没有 statusSource，已忽略`,
        );
        continue;
      }

      const definition: StatusSourceDefinition = byUrl.get(source.url) ?? {
        kind: source.kind,
        url: source.url,
        jobs: [],
      };
      definition.jobs.push({
        mirrorId: support.mirrorId,
        ecosystemId: ecosystem.id,
        job: support.statusJob,
      });
      byUrl.set(source.url, definition);
    }
  }

  return { sources: [...byUrl.values()], diagnostics };
}
