import semver from 'semver';

/** 软件版本排序：Node等使用semver，日期/构建编号使用数字自然序。latest是镜像别名，不冒充上游最新版。 */
export function compareRepoVersions(_repo: string, a: string, b: string): number {
  if (a === b) return 0;
  if (a === 'latest') return 1;
  if (b === 'latest') return -1;
  const left = semver.valid(a),
    right = semver.valid(b);
  if (left && right) return semver.compare(left, right);
  return a.localeCompare(b, 'en', { numeric: true });
}
