import { describe, it, expect } from 'vitest';
import tar from 'tar-stream';
import { zstdCompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { texliveFiles, juliaRegistryFiles, firmwareFiles } from './extraParsers.js';
import type { IndexedFile } from './policy.js';
import { executeIndexJob } from './adapters.js';
import { SourceClient } from './source.js';
import { aptScope, indexFixture, fixtureFile, fixtureSnapshot } from '../db/indexFixture.js';
import { queryFiles } from '../db/fileQueries.js';

describe('协议补充及逻辑范围', () => {
  it('Zstandard索引以Node组件解压，同时校验原压缩正文，不将压缩索引当成文件', async () => {
    const body = zstdCompressSync(
      Buffer.from(
        'Package: hello\nVersion: 1.0\nArchitecture: amd64\nFilename: pool/hello_1.0_amd64.deb\nSize: 20\n\n',
      ),
    );
    const db = indexFixture();
    try {
      const source = new SourceClient(
        (async () => new Response(new Uint8Array(body))) as typeof fetch,
      );
      await executeIndexJob(
        db,
        {
          ...aptScope,
          kind: 'apt-packages',
          indexUrl: 'https://mirrors.pku.edu.cn/debian/Packages.zst',
          expected: {
            size: body.byteLength,
            sha256: createHash('sha256').update(body).digest('hex'),
          },
        },
        'zstd',
        source,
        async () => {},
      );
      expect(queryFiles(db, { resource: 'pku:debian' }).items[0]?.packageName).toBe('hello');
      expect(source.requests).toBe(1);
    } finally {
      db.close();
    }
  });
  it('解析/入队等待不计入网络读超时，后台大清单不会因分批入队而截断', async () => {
    const source = new SourceClient((async () => new Response('index')) as typeof fetch, 10);
    const digest = await source.consume(
      'https://mirrors.pku.edu.cn/debian/Release',
      async (stream) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return await new Response(stream).text();
      },
    );
    expect(digest).toEqual({
      value: 'index',
      digest: createHash('sha256').update('index').digest('hex'),
    });
  });
  it('TeXLive只提取有容器信息的包，不把配置/文件路径当安装包', async () => {
    const data = `name 00texlive.config\ncategory TLCore\nrevision 1\n\nname latex\ncategory Package\nrevision 12345\ncontainersize 100\ncontainerchecksum ${'a'.repeat(128)}\n\n`;
    const files: IndexedFile[] = [];
    await texliveFiles(
      new Response(data).body!,
      'https://mirrors.pku.edu.cn/ctan/systems/texlive/tlnet/',
      (file) => files.push(file),
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      packageName: 'latex',
      version: '12345',
      url: 'https://mirrors.pku.edu.cn/ctan/systems/texlive/tlnet/archive/latex.tar.xz',
      checksum: { algorithm: 'sha512' },
    });
  });
  it('Julia使用注册表UUID/树身份构建协议直链，元数据次序不同也能完整匹配', async () => {
    const archive = tar.pack();
    const uuid = '23338594-aafe-5451-b93e-139f81909106';
    archive.entry(
      { name: 'T/Test/Versions.toml' },
      `["1.0.0"]\ngit-tree-sha1="${'a'.repeat(40)}"\n["2.0.0"]\ngit-tree-sha1="${'a'.repeat(40)}"\n`,
    );
    archive.entry({ name: 'T/Test/Package.toml' }, `name="Test"\nuuid="${uuid}"\n`);
    archive.finalize();
    const files: IndexedFile[] = [];
    await juliaRegistryFiles(
      Readable.toWeb(
        Readable.from(archive as unknown as AsyncIterable<Uint8Array>),
      ) as ReadableStream<Uint8Array>,
      'https://mirrors.pku.edu.cn/julia/',
      (file) => files.push(file),
    );
    expect(files).toHaveLength(2);
    expect(files[0]?.url).toBe(
      `https://mirrors.pku.edu.cn/julia/package/${uuid}/${'a'.repeat(40)}`,
    );
    expect(files[0]?.checksum).toBeUndefined();
    const db = indexFixture();
    try {
      fixtureSnapshot(db, 'shared-body', files, {
        ...aptScope,
        protocol: 'julia',
        baseUrl: 'https://mirrors.pku.edu.cn/julia/',
      });
      expect(queryFiles(db, { resource: 'pku:debian', version: '2.0.0' }).items).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it('OpenWrt按profiles明确的设备镜像识别，不靠bin扩展名猜包', () => {
    const files: IndexedFile[] = [];
    firmwareFiles(
      {
        version_number: '24.10.3',
        arch_packages: 'aarch64_generic',
        profiles: {
          test: {
            images: [
              {
                name: 'openwrt-24.10.3-test-sysupgrade.bin',
                sha256: 'f'.repeat(64),
                type: 'sysupgrade',
              },
            ],
          },
        },
      },
      'https://mirrors.pku.edu.cn/openwrt/releases/24.10.3/targets/test/',
      (file) => files.push(file),
    );
    expect(files[0]).toMatchObject({
      packageName: 'test',
      version: '24.10.3',
      role: 'firmware',
      format: 'bin',
    });
  });
  it('opkg从索引摘取包名/版本/原文件路径，不下载依赖包', async () => {
    const db = indexFixture();
    try {
      const source = new SourceClient(
        (async () =>
          new Response(
            'Package: hello\nVersion: 1.0-1\nArchitecture: aarch64_generic\nFilename: hello_1.0-1_aarch64_generic.ipk\nSize: 20\n\n',
          )) as typeof fetch,
      );
      await executeIndexJob(
        db,
        {
          ...aptScope,
          protocol: 'opkg',
          kind: 'opkg-packages',
          indexUrl: 'https://mirrors.pku.edu.cn/debian/Packages',
        },
        'opkg',
        source,
        async () => {},
      );
      expect(queryFiles(db, { resource: 'pku:debian' }).items[0]).toMatchObject({
        packageName: 'hello',
        format: 'ipk',
        arch: 'aarch64_generic',
      });
    } finally {
      db.close();
    }
  });
  it('元数据文件名包含新哈希仍更新同一逻辑范围，不让老包永久混入有效数据', () => {
    const db = indexFixture();
    try {
      const scope = {
        ...aptScope,
        protocol: 'rpm',
        indexUrl: 'https://mirrors.pku.edu.cn/debian/repodata/hash-a-primary.xml.gz',
      };
      fixtureSnapshot(db, 'old', [fixtureFile('old')], scope);
      fixtureSnapshot(db, 'new', [fixtureFile('new')], {
        ...scope,
        indexUrl: scope.indexUrl.replace('hash-a', 'hash-b'),
      });
      expect(
        queryFiles(db, { resource: 'pku:debian' }).items.map((file) => file.packageName),
      ).toEqual(['new']);
    } finally {
      db.close();
    }
  });
});
