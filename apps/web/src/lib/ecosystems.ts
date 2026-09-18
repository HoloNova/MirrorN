import type { Ecosystem, Mirror, Troubleshooting } from '@mirrorn/shared';

import mirrorsJson from '../../../../data/mirrors.json';

/**
 * 前端不做运行时 schema 校验：`data/` 下的 JSON 由 `pnpm validate:data` 在构建前和 CI 中
 * 用 shared 的 zod schema 校验，浏览器只消费已经校验过的结果。这样 zod 不会被打进前端产物。
 *
 * 代价与前提：校验一旦被跳过，这里不会抛出错误，只会静默渲染出错误内容。因此
 * `build`、`build:web`、`dev:web` 和 `dev` 都先执行 `validate:data`；新增数据文件时不要绕过它。
 */
const ecosystemModules = import.meta.glob<unknown>('../../../../data/ecosystems/*.json', {
  eager: true,
  import: 'default',
});

const troubleshootingModules = import.meta.glob<unknown>(
  '../../../../data/troubleshooting/*.json',
  {
    eager: true,
    import: 'default',
  },
);

const mirrors = mirrorsJson as Mirror[];

const ecosystems = Object.keys(ecosystemModules)
  .sort()
  .map((path) => ecosystemModules[path] as Ecosystem);

const troubleshooting = Object.keys(troubleshootingModules)
  .sort()
  .flatMap((path) => troubleshootingModules[path] as Troubleshooting[]);

export interface Catalog {
  mirrors: Mirror[];
  ecosystems: Ecosystem[];
  troubleshooting: Troubleshooting[];
}

export function getCatalog(): Catalog {
  return {
    mirrors,
    ecosystems,
    troubleshooting,
  };
}

export function getEcosystem(
  ecosystemId: string,
  catalog: Catalog = getCatalog(),
): Ecosystem | undefined {
  return catalog.ecosystems.find((ecosystem) => ecosystem.id === ecosystemId);
}

export function getMirror(mirrorId: string, catalog: Catalog = getCatalog()): Mirror | undefined {
  return catalog.mirrors.find((mirror) => mirror.id === mirrorId);
}

export function getMirrorName(mirrorId: string, catalog: Catalog = getCatalog()): string {
  return getMirror(mirrorId, catalog)?.name ?? mirrorId;
}

export function getTroubleshooting(
  ecosystemId: string,
  catalog: Catalog = getCatalog(),
): Troubleshooting[] {
  return catalog.troubleshooting.filter((entry) => entry.ecosystemId === ecosystemId);
}

/** 选择器使用的数据完整性自检，避免加入新数据后出现空引用。 */
export function listEcosystemMirrors(
  ecosystem: Ecosystem,
  catalog: Catalog = getCatalog(),
): Mirror[] {
  return ecosystem.supports
    .map((support) => getMirror(support.mirrorId, catalog))
    .filter((mirror): mirror is Mirror => mirror !== undefined);
}
