import { describe, expect, it } from 'vitest';

import { DEFAULT_PORT, resolvePort, resolveServerEnv } from './config.js';

function resolve(argv: string[], env: Record<string, string | undefined> = {}) {
  return resolvePort({ argv, env });
}

describe('resolvePort', () => {
  it('falls back to the default port when nothing is configured', () => {
    expect(resolve([])).toEqual({ ok: true, value: { port: DEFAULT_PORT, source: 'default' } });
  });

  it('honours MIRRORN_PORT and PORT when no flag is given', () => {
    expect(resolve([], { MIRRORN_PORT: '9100' })).toEqual({
      ok: true,
      value: { port: 9100, source: 'MIRRORN_PORT' },
    });
    expect(resolve([], { PORT: '9200' })).toEqual({
      ok: true,
      value: { port: 9200, source: 'PORT' },
    });
  });

  it('lets the project-specific variable win over the generic PORT', () => {
    expect(resolve([], { MIRRORN_PORT: '9100', PORT: '9200' })).toEqual({
      ok: true,
      value: { port: 9100, source: 'MIRRORN_PORT' },
    });
  });

  it('lets --port win over the environment, which is why dev pins the port there', () => {
    // 场景：shell 里恰好导出了 PORT=30141（被同机其他工具占用），dev 仍然必须绑 8787。
    expect(resolve(['--port', '8787'], { PORT: '30141' })).toEqual({
      ok: true,
      value: { port: 8787, source: '--port' },
    });
  });

  it('accepts the --port=value form', () => {
    expect(resolve(['--port=9300'])).toEqual({ ok: true, value: { port: 9300, source: '--port' } });
  });

  it('lets a later --port override the one baked into the dev script', () => {
    expect(resolve(['--port', '8787', '--port', '9000'])).toEqual({
      ok: true,
      value: { port: 9000, source: '--port' },
    });
  });

  it('ignores unrelated arguments', () => {
    expect(resolve(['--verbose', '--port', '9400'])).toEqual({
      ok: true,
      value: { port: 9400, source: '--port' },
    });
  });

  it('reports invalid values instead of silently using another port', () => {
    expect(resolve(['--port', '0'])).toEqual({
      ok: false,
      message: '--port 必须是 1 到 65535 之间的整数，当前值：0',
    });
    expect(resolve([], { PORT: 'abc' })).toEqual({
      ok: false,
      message: 'PORT 必须是 1 到 65535 之间的整数，当前值：abc',
    });
    expect(resolve([], { MIRRORN_PORT: '70000' })).toEqual({
      ok: false,
      message: 'MIRRORN_PORT 必须是 1 到 65535 之间的整数，当前值：70000',
    });
  });

  it('reports a missing flag value instead of falling through', () => {
    expect(resolve(['--port'])).toEqual({ ok: false, message: '--port 后面缺少端口号。' });
    expect(resolve(['--port', '--verbose'])).toEqual({
      ok: false,
      message: '--port 后面缺少端口号。',
    });
  });

  it('ignores empty environment values', () => {
    expect(resolve([], { PORT: '', MIRRORN_PORT: '' })).toEqual({
      ok: true,
      value: { port: DEFAULT_PORT, source: 'default' },
    });
  });
});

describe('resolveServerEnv', () => {
  it('只在设置了 MIRRORN_STATIC_DIR 时才托管静态页面', () => {
    const off = resolveServerEnv({ argv: [], env: {} });
    expect(off.ok && off.value.staticDir).toBeUndefined();

    const on = resolveServerEnv({
      argv: [],
      env: { MIRRORN_STATIC_DIR: '/app/static/' },
    });
    expect(on.ok && on.value.staticDir).toBe('/app/static');
  });

  function env(overrides: Record<string, string | undefined> = {}) {
    return resolveServerEnv({ argv: [], env: overrides });
  }

  it('applies conservative defaults', () => {
    const result = env();

    expect(result).toEqual({
      ok: true,
      value: {
        port: DEFAULT_PORT,
        portSource: 'default',
        host: '127.0.0.1',
        snapshotDir: 'apps/server/.data',
        syncEnabled: true,
        syncIntervalMs: 15 * 60 * 1000,
        staleAfterMs: 45 * 60 * 1000,
        fetchTimeoutMs: 10_000,
        maxResponseBytes: 4 * 1024 * 1024,
        // 默认不信任转发头、默认没有指纹 secret：宁可不可用，也不提供假指纹。
        trustProxy: false,
      },
    });
  });

  it('reads the snapshot directory and fingerprint settings from the environment', () => {
    const result = env({
      MIRRORN_SNAPSHOT_DIR: '/var/lib/mirrorn/',
      MIRRORN_FINGERPRINT_SECRET: 's3cret',
      MIRRORN_TRUSTED_PROXY: 'true',
      MIRRORN_SYNC_ENABLED: '0',
      MIRRORN_DATA_DIR: '/srv/data',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.snapshotDir).toBe('/var/lib/mirrorn');
    expect(result.value.fingerprintSecret).toBe('s3cret');
    expect(result.value.trustProxy).toBe(true);
    expect(result.value.syncEnabled).toBe(false);
    expect(result.value.dataDir).toBe('/srv/data');
  });

  it('treats blank values as absent instead of as empty settings', () => {
    const result = env({ MIRRORN_FINGERPRINT_SECRET: '   ', MIRRORN_SNAPSHOT_DIR: '  ' });

    expect(result.ok && result.value.fingerprintSecret).toBeUndefined();
    expect(result.ok && result.value.snapshotDir).toBe('apps/server/.data');
  });

  it('rejects malformed numbers instead of silently falling back', () => {
    expect(env({ MIRRORN_SYNC_INTERVAL_MS: 'soon' })).toEqual({
      ok: false,
      message: 'MIRRORN_SYNC_INTERVAL_MS 必须是正整数，当前值：soon',
    });
    expect(env({ MIRRORN_MAX_RESPONSE_BYTES: '-1' })).toEqual({
      ok: false,
      message: 'MIRRORN_MAX_RESPONSE_BYTES 必须是正整数，当前值：-1',
    });
  });

  it('propagates port resolution failures', () => {
    expect(env({ MIRRORN_PORT: 'nope' })).toMatchObject({ ok: false });
  });
});
