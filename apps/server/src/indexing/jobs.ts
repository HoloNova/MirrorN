import { createHash } from 'node:crypto';
import type { ScopeSpec } from './policy.js';

export type IndexJob =
  | { kind: 'refresh' }
  | { kind: 'catalog' }
  | { kind: 'pypi-dispatch' }
  | (ScopeSpec & {
      kind:
        | 'directory'
        | 'apt-release'
        | 'apt-packages'
        | 'opkg-packages'
        | 'apk-index'
        | 'firmware-profiles'
        | 'texlive-db'
        | 'julia-root'
        | 'julia-registry'
        | 'pypi-root'
        | 'pypi-project'
        | 'rpm-repomd'
        | 'rpm-primary'
        | 'pacman-db'
        | 'conda-index'
        | 'r-packages';
      lineage?: string[];
      compression?: 'gzip' | 'xz' | 'zstd';
      expected?: { size?: number; sha256?: string };
    });
export function taskKey(data: IndexJob): string {
  return createHash('sha256')
    .update(
      !('resourceId' in data)
        ? data.kind
        : JSON.stringify([data.kind, data.resourceId, data.indexUrl]),
    )
    .digest('hex');
}
export type Enqueue = (tasks: IndexJob[]) => Promise<void>;

/** 审核配置只声明协议与入口，不维护文件清单；所有文件都从源索引动态产生。 */
export function collector(repo: string): string {
  if (
    [
      'ubuntu',
      'ubuntu-ports',
      'debian',
      'debian-security',
      'debian-multimedia',
      'termux',
      'anthon',
    ].includes(repo)
  )
    return 'apt';
  if (
    [
      'epel',
      'centos',
      'centos-vault',
      'centos-stream',
      'rocky',
      'rocky-vault',
      'almalinux',
      'openeuler',
      'opensuse',
      'kubernetes',
    ].includes(repo)
  )
    return 'rpm';
  if (
    ['manjaro', 'archlinux', 'archlinuxcn', 'loongarch', 'loongarch-lcpu', 'archriscv'].includes(
      repo,
    )
  )
    return 'pacman';
  if (['openwrt', 'immortalwrt'].includes(repo)) return 'opkg';
  if (['CRAN', 'bioconductor'].includes(repo)) return 'r';
  if (repo === 'anaconda') return 'conda';
  if (repo === 'pypi') return 'pypi';
  if (repo === 'ctan') return 'texlive';
  if (repo === 'julia') return 'julia';
  if (['tensorlayerx', 'dl-release'].includes(repo)) return 'excluded-dataset';
  return 'directory';
}
