import { afterEach, describe, it, expect } from 'vitest';
import { rememberSite, selectDownloadCandidate, setSaveTraffic } from './downloadPreference';
import type { DownloadCandidate } from './resourceApi';
const sources: DownloadCandidate[] = [
  {
    id: 'foreign:node',
    siteId: 'foreign',
    siteName: '海外来源',
    downloadEntry: 'https://example.com/node/',
    region: 'unknown',
    artifactCount: 1,
  },
  {
    id: 'pku:node',
    siteId: 'pku',
    siteName: '北大',
    downloadEntry: 'https://mirrors.pku.edu.cn/nodejs-release/',
    region: 'CN',
    artifactCount: 1,
  },
];
afterEach(() => setSaveTraffic(false));
describe('下载来源选择（纯业务逻辑，无界面测试）', () => {
  it('记住用户选站，开启节省流量后不使用被排除的偏好，也不回退海外', () => {
    rememberSite('node-test', 'foreign');
    expect(selectDownloadCandidate(sources, 'node-test')).toBe('foreign:node');
    setSaveTraffic(true);
    expect(selectDownloadCandidate(sources, 'node-test', 'foreign')).toBe('pku:node');
    expect(selectDownloadCandidate([sources[0]!], 'node-test')).toBe('');
    setSaveTraffic(false);
    expect(selectDownloadCandidate(sources, 'node-test')).toBe('foreign:node');
  });
});
