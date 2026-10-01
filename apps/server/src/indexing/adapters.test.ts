import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { SourceClient } from './source.js';
import { executeIndexJob } from './adapters.js';
import type { IndexJob } from './jobs.js';
import { indexFixture, fixtureFile, fixtureSnapshot, aptScope } from '../db/indexFixture.js';
import { queryFiles } from '../db/fileQueries.js';
import { aptIndexes, pythonFile, controlRecords, rpmFiles } from './parsers.js';

const packages =
  'Package: hello\nVersion: 2.10-4\nArchitecture: amd64\nFilename: pool/main/h/hello/hello_2.10-4_amd64.deb\nSize: 53080\nSHA256: ' +
  'a'.repeat(64) +
  '\nDepends: libc6 (>= 2.34)\n\n';
describe('动态源索引采集', () => {
  it('从完整压缩Packages元数据生成文件和包信息，不下载包体；失败校验保留旧批次', async () => {
    const db = indexFixture();
    const body = gzipSync(packages);
    const sha256 = createHash('sha256').update(body).digest('hex');
    const requests: string[] = [];
    const source = new SourceClient((async (input) => {
      requests.push(String(input));
      return new Response(body);
    }) as typeof fetch);
    try {
      const task: IndexJob = {
        ...aptScope,
        kind: 'apt-packages',
        expected: { size: body.byteLength, sha256 },
      };
      await executeIndexJob(db, task, 'good', source, async () => {});
      expect(queryFiles(db, { resource: 'pku:debian', package: 'hello' }).items[0]).toMatchObject({
        version: '2.10-4',
        release: 'bookworm',
        size: 53080,
        checksum: { algorithm: 'sha256', value: 'a'.repeat(64) },
      });
      expect(requests).toEqual([aptScope.indexUrl]);
      await expect(
        executeIndexJob(
          db,
          { ...task, expected: { size: body.byteLength, sha256: 'b'.repeat(64) } },
          'bad',
          source,
          async () => {},
        ),
      ).rejects.toThrow('SHA256');
      expect(queryFiles(db, { resource: 'pku:debian' }).items[0]?.version).toBe('2.10-4');
    } finally {
      db.close();
    }
  });
  it('完整遍历发现任务，不截成最新几个；自引用目录停止而不删旧文件', async () => {
    const db = indexFixture();
    const queued: IndexJob[] = [];
    const payload = Array.from({ length: 12 }, (_, i) => ({
      name: `v${i}.0.0`,
      type: 'directory',
    }));
    const source = new SourceClient((async () => Response.json(payload)) as typeof fetch);
    try {
      const task: IndexJob = {
        ...aptScope,
        kind: 'directory',
        protocol: 'directory',
        indexUrl: 'https://mirrors.pku.edu.cn/files/debian/',
        baseUrl: 'https://mirrors.pku.edu.cn/debian/',
        lineage: [],
      };
      await executeIndexJob(db, task, 'discover', source, async (tasks) => {
        queued.push(...tasks);
      });
      expect(queued).toHaveLength(12);
      const cycle = await executeIndexJob(db, queued[0]!, 'cycle', source, async () => {
        throw new Error('循环不应继续入队');
      });
      expect(cycle).toEqual({ alias: true });
    } finally {
      db.close();
    }
  });
  it('Release按组件架构取完整Packages，重复压缩形式只采集一次', () => {
    const prefix = 'Suite: bookworm\nCodename: bookworm\nSHA256:\n';
    const line = (path: string) => ` ${'a'.repeat(64)} 100 ${path}\n`;
    expect(
      aptIndexes(
        prefix +
          line('main/binary-amd64/Packages.xz') +
          line('main/binary-amd64/Packages.gz') +
          line('contrib/binary-arm64/Packages.gz'),
      ),
    ).toMatchObject([
      { path: 'main/binary-amd64/Packages.gz', architecture: 'amd64', component: 'main' },
      { architecture: 'arm64', component: 'contrib' },
    ]);
  });
  it('跨流分片解析完整包字段；Python按官方链接和wheel标签，不猜文件路径', async () => {
    const bytes = new TextEncoder().encode(packages);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    });
    const rows = [];
    for await (const row of controlRecords(stream)) rows.push(row);
    expect(rows[0]?.Depends).toBe('libc6 (>= 2.34)');
    const file = pythonFile(
      {
        href: '../../packages/xx/six-1.17.0-py2.py3-none-any.whl#sha256=' + 'c'.repeat(64),
        'data-requires-python': '>=2.7',
      },
      'https://mirrors.pku.edu.cn/pypi/web/simple/six/',
      'Six',
    );
    expect(file).toMatchObject({
      packageName: 'six',
      version: '1.17.0',
      platform: 'any',
      format: 'whl',
      compatibility: { python: 'py2.py3', requiresPython: '>=2.7' },
      checksum: { value: 'c'.repeat(64) },
    });
  });
  it('RPM索引结束不完整时拒绝发布，不能拿半份文件覆盖', async () => {
    const malformed =
      '<metadata><package type="rpm"><name>hello</name><arch>x86_64</arch><version epoch="0" ver="1" rel="2"/><size package="10"/><location href="Packages/hello-1-2.rpm"/></package>';
    const stream = new Response(malformed).body!;
    await expect(
      rpmFiles(stream, 'https://mirrors.pku.edu.cn/epel/9/Everything/x86_64/', () => {}),
    ).rejects.toThrow('未完整结束');
  });
  it('HTTP失败与异常空目录都不移除已有文件', async () => {
    const db = indexFixture();
    fixtureSnapshot(db, 'old', [fixtureFile()]);
    const source = new SourceClient(
      (async () => new Response('', { status: 503 })) as typeof fetch,
    );
    try {
      await expect(
        executeIndexJob(db, { ...aptScope, kind: 'apt-packages' }, 'fail', source, async () => {}),
      ).rejects.toThrow('503');
      expect(queryFiles(db, { resource: 'pku:debian' }).items).toHaveLength(1);
    } finally {
      db.close();
    }
  });
});
