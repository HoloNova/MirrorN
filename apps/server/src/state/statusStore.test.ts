import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createStatusStore, type StatusStoreOptions } from './statusStore.js';
import type { StatusSourceDefinition } from '../upstream/statusSources.js';

const tunasyncUrl = 'https://mirror.example/static/tunasync.json';

const sources: StatusSourceDefinition[] = [
  {
    kind: 'tunasync',
    url: tunasyncUrl,
    jobs: [{ mirrorId: 'mirror-a', ecosystemId: 'pip', job: 'pypi' }],
  },
];

function payload(status = 'success', lastUpdateTs = 1789760213): string {
  return JSON.stringify([
    {
      name: 'pypi',
      status,
      last_update_ts: lastUpdateTs,
      last_ended_ts: lastUpdateTs,
      next_schedule_ts: lastUpdateTs + 3600,
      upstream: 'https://pypi.org',
    },
  ]);
}

function makeStore(
  overrides: Partial<StatusStoreOptions> & { body?: string; fail?: boolean } = {},
): { store: ReturnType<typeof createStatusStore>; calls: () => number } {
  let calls = 0;
  const { body, fail, ...rest } = overrides;

  const store = createStatusStore({
    sources,
    now: () => 1_800_000_000_000,
    fetchImpl: (async () => {
      calls += 1;
      if (fail) {
        return new Response('down', { status: 500 });
      }
      return new Response(body ?? payload(), { status: 200 });
    }) as unknown as typeof fetch,
    ...rest,
  });

  return { store, calls: () => calls };
}

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mirrorn-status-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('statusStore.refresh', () => {
  it('publishes items for the declared jobs after a successful refresh', async () => {
    const { store } = makeStore();
    const summary = await store.refresh();

    expect(summary).toEqual({ attempted: 1, ok: 1, failed: 0, skipped: false });
    const snapshot = store.read();
    expect(snapshot.stale).toBe(false);
    expect(snapshot.fetchedAt).toBe(1_800_000_000_000);
    expect(snapshot.items).toEqual([
      {
        mirrorId: 'mirror-a',
        ecosystemId: 'pip',
        status: 'success',
        lastSuccessAt: 1789760213000,
        lastAttemptAt: 1789760213000,
        nextScheduleAt: 1789763813000,
        upstream: 'https://pypi.org',
        job: 'pypi',
        sourceUrl: tunasyncUrl,
      },
    ]);
  });

  it('keeps the last successful data when a later refresh fails', async () => {
    let fail = false;
    const store = createStatusStore({
      sources,
      now: () => 1_800_000_000_000,
      fetchImpl: (async () =>
        fail
          ? new Response('down', { status: 500 })
          : new Response(payload(), { status: 200 })) as unknown as typeof fetch,
    });

    await store.refresh();
    fail = true;
    const second = await store.refresh();

    expect(second).toEqual({ attempted: 1, ok: 0, failed: 1, skipped: false });
    expect(store.read().items).toHaveLength(1);
    expect(store.read().sources[0]).toMatchObject({ ok: false, error: 'HTTP 500' });
  });

  it('does not overlap concurrent refreshes', async () => {
    let resolveFetch: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });

    let calls = 0;
    const store = createStatusStore({
      sources,
      now: () => 1_800_000_000_000,
      fetchImpl: (async () => {
        calls += 1;
        await gate;
        return new Response(payload(), { status: 200 });
      }) as unknown as typeof fetch,
    });

    const first = store.refresh();
    // 两个请求同时在途：第二次必须复用第一次的结果，而不是再发一次请求。
    const second = store.refresh();
    resolveFetch?.();
    const [firstSummary, secondSummary] = await Promise.all([first, second]);

    expect(calls).toBe(1);
    expect(firstSummary.skipped).toBe(false);
    expect(secondSummary.skipped).toBe(true);
  });

  it('downgrades statuses to unknown once the data is too old', async () => {
    let now = 1_800_000_000_000;
    const store = createStatusStore({
      sources,
      now: () => now,
      staleAfterMs: 1000,
      fetchImpl: (async () => new Response(payload(), { status: 200 })) as unknown as typeof fetch,
    });

    await store.refresh();
    expect(store.read().items[0]?.status).toBe('success');

    now += 5000;
    const staleRead = store.read();
    expect(staleRead.stale).toBe(true);
    // 过期数据不能伪装成当前的“已同步”，但保留时间戳供界面说明。
    expect(staleRead.items[0]?.status).toBe('unknown');
    expect(staleRead.items[0]?.lastSuccessAt).toBe(1789760213000);
  });

  it('reports unknown when the upstream file has no matching job', async () => {
    const { store } = makeStore({ body: JSON.stringify([{ name: 'ubuntu', status: 'success' }]) });
    await store.refresh();

    expect(store.read().items).toEqual([]);
    expect(store.read().sources[0]).toMatchObject({ ok: true, recordCount: 1 });
  });

  it('skips unsupported source kinds instead of pretending to have data', async () => {
    const store = createStatusStore({
      sources: [{ ...sources[0]!, kind: 'unknown-format' as never }],
      now: () => 1_800_000_000_000,
      fetchImpl: (async () => new Response(payload(), { status: 200 })) as unknown as typeof fetch,
    });

    await store.refresh();
    expect(store.read().items).toEqual([]);
    expect(store.read().sources[0]?.error).toContain('不支持的状态文件类型');
  });
});

describe('statusStore snapshots', () => {
  it('writes and reloads a snapshot', async () => {
    const dir = await makeTempDir();
    const snapshotPath = join(dir, 'nested', 'status.json');

    const first = makeStore({ snapshotPath });
    await first.store.refresh();
    const raw = JSON.parse(await readFile(snapshotPath, 'utf8')) as { version: number };
    expect(raw.version).toBe(1);

    // 新进程：先读快照，再（失败地）刷新，仍应显示上次成功的数据。
    const second = makeStore({ snapshotPath, fail: true });
    expect(await second.store.loadSnapshot()).toEqual({ loaded: true });
    expect(second.store.read().items[0]?.status).toBe('success');

    await second.store.refresh();
    expect(second.store.read().items[0]?.status).toBe('success');
  });

  it('ignores a corrupt snapshot and degrades to unknown', async () => {
    const dir = await makeTempDir();
    const snapshotPath = join(dir, 'status.json');
    await writeFile(snapshotPath, '{"version":1,"response":{"items":"nope"}}', 'utf8');

    const { store } = makeStore({ snapshotPath });
    expect(await store.loadSnapshot()).toEqual({ loaded: false, reason: '快照内容不符合契约' });
    expect(store.read().stale).toBe(true);
    expect(store.read().items).toEqual([]);
  });

  it('reports a missing snapshot without failing', async () => {
    const dir = await makeTempDir();
    const { store } = makeStore({ snapshotPath: join(dir, 'missing.json') });

    expect(await store.loadSnapshot()).toEqual({ loaded: false, reason: '没有可用快照' });
  });

  it('survives a snapshot write failure', async () => {
    const dir = await makeTempDir();
    // 用目录当快照路径：写入必然失败，但刷新结果仍要保留在内存里。
    const { store } = makeStore({ snapshotPath: dir });

    const summary = await store.refresh();
    expect(summary.ok).toBe(1);
    expect(store.read().items).toHaveLength(1);
    expect(await store.saveSnapshot()).toMatchObject({ saved: false });
  });
});

describe('statusStore lifecycle', () => {
  it('starts and stops its timer without keeping the process alive', async () => {
    const { store } = makeStore({ intervalMs: 5 });
    store.start();
    store.start();
    store.stop();
    expect(() => store.stop()).not.toThrow();
  });

  it('does not schedule anything when there are no sources', () => {
    const store = createStatusStore({ sources: [], now: () => 0 });
    store.start();
    expect(store.hasSources()).toBe(false);
    store.stop();
    expect(store.read().items).toEqual([]);
  });
});
