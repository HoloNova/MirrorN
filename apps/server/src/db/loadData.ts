import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  EcosystemTaxonomySchema,
  MirrorListSchema,
  SiteInventorySchema,
  SiteResourceListSchema,
  TutorialListSchema,
  type EcosystemTaxonomyEntry,
  type Mirror,
  type SiteInventory,
  type SiteResourceList,
  type Tutorial,
} from '@mirrorn/shared';

/**
 * 读入审阅过的数据文件（`data/*.json`）。
 *
 * 这些文件在构建期与 CI 里已经用同一套 zod schema 校验过（`scripts/validate-data.ts`），
 * 服务端再验一遍是为了“部署目录里的数据被人手改坏”时不至于把坏数据写进数据库——
 * 出错就让服务不带库启动，接口返回空列表，而不是抛栈。
 */
export interface CatalogData {
  mirrors: Mirror[];
  taxonomy: EcosystemTaxonomyEntry[];
  siteResources: SiteResourceList[];
  tutorials: Tutorial[];
  inventories: SiteInventory[];
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

export async function loadCatalogData(dataDir: string): Promise<CatalogData> {
  const mirrors = MirrorListSchema.parse(await readJson(resolve(dataDir, 'mirrors.json')));
  const taxonomy = EcosystemTaxonomySchema.parse(
    await readJson(resolve(dataDir, 'ecosystem-taxonomy.json')),
  );
  const tutorials = TutorialListSchema.parse(await readJson(resolve(dataDir, 'tutorials.json')));

  const siteResources: SiteResourceList[] = [];
  for (const file of (await readdir(resolve(dataDir, 'site-resources'))).filter((name) =>
    name.endsWith('.json'),
  )) {
    siteResources.push(
      SiteResourceListSchema.parse(await readJson(resolve(dataDir, 'site-resources', file))),
    );
  }

  const inventories: SiteInventory[] = [];
  for (const file of (await readdir(resolve(dataDir, 'site-inventories'))).filter((name) =>
    name.endsWith('.json'),
  )) {
    inventories.push(
      SiteInventorySchema.parse(await readJson(resolve(dataDir, 'site-inventories', file))),
    );
  }

  return { mirrors, taxonomy, siteResources, tutorials, inventories };
}
