import { describe, expect, it } from 'vitest';

import {
  computeFingerprint,
  fingerprintAddress,
  normalizeAddress,
  resolveClientAddress,
} from './fingerprint.js';

describe('normalizeAddress', () => {
  it('maps IPv4 to its /24 network', () => {
    expect(normalizeAddress('203.0.113.45')).toBe('203.0.113.0/24');
    expect(normalizeAddress('203.0.113.45')).toBe(normalizeAddress('203.0.113.99'));
    expect(normalizeAddress('203.0.113.45')).not.toBe(normalizeAddress('203.0.114.45'));
  });

  it('maps IPv6 to its /48 prefix', () => {
    expect(normalizeAddress('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::/48');
    expect(normalizeAddress('2001:db8:abcd:12::1')).toBe(normalizeAddress('2001:db8:abcd:ffff::9'));
    expect(normalizeAddress('2001:db8:abcd:12::1')).not.toBe(
      normalizeAddress('2001:db8:abce:12::1'),
    );
  });

  it('handles IPv4-mapped IPv6 the same as plain IPv4', () => {
    expect(normalizeAddress('::ffff:198.51.100.7')).toBe(normalizeAddress('198.51.100.7'));
  });

  it('rejects values it cannot trust', () => {
    expect(normalizeAddress('not-an-ip')).toBeUndefined();
    expect(normalizeAddress('999.1.1.1')).toBeUndefined();
    expect(normalizeAddress('')).toBeUndefined();
    expect(normalizeAddress('2001:db8::zz::1')).toBeUndefined();
  });
});

describe('resolveClientAddress', () => {
  it('ignores X-Forwarded-For unless a trusted proxy is configured', () => {
    expect(
      resolveClientAddress({
        remoteAddress: '10.0.0.5',
        forwardedFor: '1.2.3.4',
        trustProxy: false,
      }),
    ).toBe('10.0.0.5');
  });

  it('uses the last entry when a trusted proxy is configured', () => {
    // 客户端自己塞的 1.2.3.4 必须被忽略：可信代理追加的真实地址在最右边。
    expect(
      resolveClientAddress({
        remoteAddress: '10.0.0.5',
        forwardedFor: '1.2.3.4, 203.0.113.45',
        trustProxy: true,
      }),
    ).toBe('203.0.113.45');
  });

  it('falls back to unavailable when nothing is usable', () => {
    expect(resolveClientAddress({ trustProxy: true })).toBeUndefined();
    expect(resolveClientAddress({ trustProxy: false, forwardedFor: '1.2.3.4' })).toBeUndefined();
  });
});

describe('fingerprintAddress', () => {
  const secret = 'test-secret';

  it('is stable for the same subnet and different across subnets', () => {
    const a = fingerprintAddress('203.0.113.1', secret);
    const b = fingerprintAddress('203.0.113.250', secret);
    const c = fingerprintAddress('203.0.114.1', secret);

    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('changes with the secret so the digest cannot be precomputed by clients', () => {
    expect(fingerprintAddress('203.0.113.1', 'one')).not.toBe(
      fingerprintAddress('203.0.113.1', 'two'),
    );
  });

  it('never returns the raw address', () => {
    const value = fingerprintAddress('203.0.113.1', secret);
    expect(value).toHaveLength(16);
    expect(value).not.toContain('203');
  });
});

describe('computeFingerprint', () => {
  it('reports unavailable without a secret or without an address', () => {
    expect(computeFingerprint({ trustProxy: false }, '203.0.113.1')).toEqual({
      available: false,
      reason: '未配置指纹 secret',
    });
    expect(computeFingerprint({ trustProxy: false, secret: 'x' }, undefined)).toEqual({
      available: false,
      reason: '拿不到可靠的客户端地址',
    });
  });

  it('reports unavailable for an address it cannot normalize', () => {
    expect(computeFingerprint({ trustProxy: false, secret: 'x' }, 'garbage')).toEqual({
      available: false,
      reason: '地址格式无法规范化',
    });
  });

  it('returns a digest when it has both parts', () => {
    expect(computeFingerprint({ trustProxy: true, secret: 'x' }, '203.0.113.7')).toEqual({
      available: true,
      fingerprint: fingerprintAddress('203.0.113.7', 'x'),
    });
  });
});
