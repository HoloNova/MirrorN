import semver from 'semver';
import { valid as validPython, compare as comparePython } from '@renovatebot/pep440';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const compareDebian = require('deb-version-compare') as (a: string, b: string) => number;

/** 未明确协议的版本保留自然顺序；不把版本字符串MAX当最新。 */
export function compareRepoVersions(repo: string, a: string, b: string): number {
  if (repo === 'pypi' && validPython(a) && validPython(b)) return comparePython(a, b) ?? 0;
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
    return compareDebian(a, b);
  const left = semver.valid(a),
    right = semver.valid(b);
  if (left && right) return semver.compare(left, right);
  return a.localeCompare(b, 'en', { numeric: true });
}
