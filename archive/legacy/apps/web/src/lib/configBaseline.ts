import type { Ecosystem, Mirror } from '@mirrorn/shared';
import { generateGuide, type OperatingSystem, type ShellKind } from '@mirrorn/shared/generators';

import { summarizeConfigDiff, type ConfigDiffSummary } from './configDiff';

/**
 * "官方默认 → 镜像配置"对照卡的数据来源。
 *
 * 做法：用**同一个生成器**把同一份配置渲染两次——一次用数据里的官方来源地址，一次用当前选中的
 * 镜像地址——再逐行比对。因此卡片里出现的每一行都来自真实数据与同一个模板，不是写死的示例。
 *
 * 为什么只对部分生态显示：对照卡的价值取决于"配置文件里有多少行不该动"。apt 与 docker-ce 的
 * 文件里除了仓库地址还有 Signed-By、安全更新段落和注释，用户需要知道哪些行不会变；
 * pip / npm 的配置基本就是一行（`index-url = …`），对照等于把上面那份文件再写一遍，
 * dockerhub 更是没有配置文件（它改的是 daemon.json 里的一个键，由用户自己填地址）。
 */
export const CONFIG_DIFF_ECOSYSTEMS: readonly string[] = ['apt', 'docker-ce'];

export interface ConfigDiffRequest {
  ecosystem: Ecosystem;
  /** 该生态的候选来源（通常来自 listEcosystemMirrors），用于找官方基线。 */
  mirrors: Mirror[];
  os: OperatingSystem;
  shell: ShellKind;
  version?: string;
  /**
   * 当前页面已经渲染好的那份配置文件内容与路径。直接传进来而不是再生成一次，
   * 是为了保证卡片对照的就是用户正在看的那份内容（同一份渲染结果）。
   */
  content: string;
  path: string;
}

export interface ConfigDiffView {
  /** 官方默认配置的来源名，例如「Ubuntu 官方归档」。 */
  baselineName: string;
  path: string;
  diff: ConfigDiffSummary;
}

export function buildConfigDiffView(request: ConfigDiffRequest): ConfigDiffView | undefined {
  if (!CONFIG_DIFF_ECOSYSTEMS.includes(request.ecosystem.id)) {
    return undefined;
  }

  const baseline = request.mirrors.find((mirror) => mirror.kind === 'official');
  if (!baseline) {
    return undefined;
  }

  const generated = generateGuide({
    ecosystem: request.ecosystem,
    mirror: baseline,
    os: request.os,
    shell: request.shell,
    ...(request.version === undefined ? {} : { version: request.version }),
  });
  if (!generated.ok || !generated.guide.configFile) {
    return undefined;
  }

  const diff = summarizeConfigDiff(generated.guide.configFile.content, request.content);
  // 选中官方源本身（或官方基线与所选镜像的地址恰好相同）时没有任何差异可对照。
  if (diff.lines.length === 0) {
    return undefined;
  }

  return {
    baselineName: baseline.name,
    path: request.path,
    diff,
  };
}
