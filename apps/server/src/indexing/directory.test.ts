import { describe, it, expect, vi } from 'vitest';
import { directoryEntries, parseHtmlDirectory } from './directory.js';
import { SourceClient, SourceError } from './source.js';

const root = 'https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v24.1.0/';
function page(rows: string, path = new URL(root).pathname) {
  return `<html><head><title>Index of ${path} | 清华大学开源软件镜像站</title></head><body><a href="outside.msi">导航不是文件</a><table>${rows}</table></body></html>`;
}
function row(href: string, size = '-') {
  return `<tr><td class="link"><a href="${href}">${href}</a></td><td class="size">${size}</td><td class="date">20 May 2025 23:12:17 +0000</td></tr>`;
}
describe('真实目录结构统一为后台文件元数据', () => {
  it('解析2026-10-05实测TUNA字段，区分估算大小与精确字节，并排除导航', () => {
    const entries = parseHtmlDirectory(
      page(
        row('../') +
          row('win-x64/') +
          row('node-v24.1.0-linux-x64.tar.xz', '30.2 MiB') +
          row('SHASUMS256.txt', '4096 B'),
      ),
      root,
    );
    expect(entries).toEqual([
      { name: 'win-x64', type: 'directory' },
      {
        name: 'node-v24.1.0-linux-x64.tar.xz',
        type: 'file',
        size: Math.round(30.2 * 1024 ** 2),
        sizeEstimated: true,
      },
      { name: 'SHASUMS256.txt', type: 'file', size: 4096 },
    ]);
  });
  it('仅取直接、同站、无查询链接；编码后的文件名正确恢复，冲突不会静默覆盖', () => {
    const entries = parseHtmlDirectory(
      page(
        row('../outside.msi') +
          row('https://mirrors.pku.edu.cn/nodejs-release/v24.1.0/foreign.msi') +
          row('?C=N&amp;O=A') +
          row(`${root}node-v24.1.0-x64.msi`, '30.5 MiB') +
          row('node-v24.1.0-x64.msi', '30.5 MiB') +
          row('name%20with%20space.txt', '12 B'),
      ),
      root,
    );
    expect(entries.map((e) => e.name)).toEqual(['node-v24.1.0-x64.msi', 'name with space.txt']);
    expect(() => parseHtmlDirectory(page(row('bad%2fescape.msi')), root)).toThrow('直接目录范围');
    expect(() => parseHtmlDirectory(page(row('bad%00.msi')), root)).toThrow('直接目录范围');
    expect(() =>
      parseHtmlDirectory(page(row('file.msi', '30 B') + row('file.msi', '31 B')), root),
    ).toThrow('互相冲突');
  });
  it('实测41字节、GET404的ISO软链接不能当镜像；真正的GiB镜像继续保留', () => {
    const directory = 'https://mirrors.tuna.tsinghua.edu.cn/ubuntu-releases/24.04/';
    const entries = parseHtmlDirectory(
      page(
        row('ubuntu-24.04.3-desktop-amd64.iso', '41 B') +
          row('ubuntu-24.04.5-live-server-amd64.iso', '3.8 GiB'),
        '/ubuntu-releases/24.04/',
      ),
      directory,
    );
    expect(entries.map((e) => e.name)).toEqual(['ubuntu-24.04.5-live-server-amd64.iso']);
  });
  it('错误页、不同目录页和截断HTML不能伪装成完整清单', () => {
    expect(() =>
      parseHtmlDirectory('<html><title>Access denied</title><table></table></html>', root),
    ).toThrow('不是当前目录');
    expect(() => parseHtmlDirectory(page(row('file.msi'), '/broken%/'), root)).toThrow(
      '路径编码无效',
    );
    expect(() => parseHtmlDirectory(page(row('file.msi'), '/another/'), root)).toThrow(
      '不是当前目录',
    );
    expect(() => parseHtmlDirectory(page(row('file.msi')).replace('</html>', ''), root)).toThrow(
      '不完整',
    );
    expect(() =>
      parseHtmlDirectory(
        `<html><title>Index of ${new URL(root).pathname}</title><p>Incomplete listing</p></html>`,
        root,
      ),
    ).toThrow('缺少文件列表');
  });
  it('北大继续取/files JSON，other类型ISO与无大小元数据保持兼容', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json([
        { name: 'ubuntu-24.04-desktop-amd64.iso', type: 'other', size: 100 },
        { name: 'v24.1.0', type: 'directory' },
      ]),
    );
    const entries = await directoryEntries(
      new SourceClient(fetchImpl),
      'https://mirrors.pku.edu.cn/ubuntu-releases/24.04/',
    );
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://mirrors.pku.edu.cn/files/ubuntu-releases/24.04/',
    );
    expect(entries).toEqual([
      { name: 'ubuntu-24.04-desktop-amd64.iso', type: 'other', size: 100 },
      { name: 'v24.1.0', type: 'directory' },
    ]);
  });
});
describe('HTML与JSON共用有界请求', () => {
  it('每站独立每秒一个请求，北大待办不占用清华的限速额度', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>(async () => Response.json([]));
      const client = new SourceClient(fetchImpl);
      const first = client.json('https://mirrors.pku.edu.cn/files/nodejs-release/');
      const second = client.json('https://mirrors.pku.edu.cn/files/anaconda/');
      const otherSite = client.json(root);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.all([first, second, otherSite]);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it('中科大尚未通过本轮核实，直接目录请求也不放行', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      directoryEntries(new SourceClient(fetchImpl), 'https://mirrors.ustc.edu.cn/node/'),
    ).rejects.toThrow('允许范围');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('HTTP403不可重试，429保留Retry-After；不跟随302', async () => {
    for (const [status, retryable, delay] of [
      [403, false, 0],
      [302, false, 0],
      [429, true, 2000],
    ] as const) {
      const fetchImpl = vi.fn<typeof fetch>(
        async () =>
          new Response('denied', {
            status,
            headers: {
              'retry-after': status === 429 ? '2' : '0',
              location: 'https://example.com/',
            },
          }),
      );
      const error = await directoryEntries(new SourceClient(fetchImpl), root).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(SourceError);
      expect(error).toMatchObject({ retryable, retryAfterMs: delay });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
    }
  });
  it('超限后取消流，不读取完整响应；200 JSON也不能冒充HTML目录', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(21));
      },
      cancel() {
        cancelled = true;
      },
    });
    const client = new SourceClient(
      async () => new Response(body, { headers: { 'content-type': 'text/html' } }),
      1000,
      20,
      100,
    );
    await expect(directoryEntries(client, root)).rejects.toThrow('体积超过限额');
    expect(client.requests).toBe(1);
    expect(client.bytes).toBe(21);
    expect(cancelled).toBe(true);
    await expect(
      directoryEntries(new SourceClient(async () => Response.json([])), root),
    ).rejects.toThrow('不是HTML');
  });
});
