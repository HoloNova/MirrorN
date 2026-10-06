import { createHmac } from 'node:crypto';

/**
 * 网络指纹：把客户端地址规范化成网段后做 HMAC，只返回摘要。
 *
 * 边界（对应 PLAN 5.4）：
 *   - 绝不记录或返回原始 IP；
 *   - 默认不信任 `X-Forwarded-For`：只有显式声明"前面有可信代理"时才解析它，
 *     否则任何人加一个请求头就能伪造指纹；
 *   - 拿不到可靠地址时返回不可用，而不是用代理地址凑一个假的指纹；
 *   - 这不是匿名化承诺：同一网段的用户会得到同一个指纹，这是我们想要的语义（识别出口变化）。
 */

/** IPv4 取 /24，IPv6 取 /48。前缀越大越容易把不同出口混为一谈，越小越接近个人标识。 */
export const IPV4_PREFIX_BITS = 24;
export const IPV6_PREFIX_BITS = 48;

export interface FingerprintOptions {
  secret?: string;
  trustProxy: boolean;
}

export interface FingerprintResult {
  available: boolean;
  fingerprint?: string;
  reason?: string;
}

function normalizeIpv4(value: string): string | undefined {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return undefined;
  }
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined;
  }
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/${IPV4_PREFIX_BITS}`;
}

function normalizeIpv6(value: string): string | undefined {
  // 只做形式检查：必须包含冒号，且各组是十六进制。
  const withoutZone = value.split('%')[0] ?? value;
  if (!withoutZone.includes(':')) {
    return undefined;
  }

  const [head, tail] = withoutZone.split('::');
  const headGroups = head ? head.split(':').filter((group) => group !== '') : [];
  const tailGroups = tail ? tail.split(':').filter((group) => group !== '') : [];
  const groups = [...headGroups, ...tailGroups];
  if (groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) {
    return undefined;
  }
  // 前 3 组（48 位）；不足时用 0 补齐。
  const prefix = [0, 1, 2].map((index) => (groups[index] ?? '0').toLowerCase());
  return `${prefix.join(':')}::/${IPV6_PREFIX_BITS}`;
}

/** 把地址规范化成网段字符串；无法识别时返回 undefined。 */
export function normalizeAddress(address: string): string | undefined {
  const trimmed = address.trim();
  if (trimmed === '') {
    return undefined;
  }

  // IPv4-mapped IPv6（::ffff:1.2.3.4）按 IPv4 处理。
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed);
  if (mapped?.[1]) {
    return normalizeIpv4(mapped[1]);
  }

  return trimmed.includes(':') ? normalizeIpv6(trimmed) : normalizeIpv4(trimmed);
}

/**
 * 从请求里取出可信的客户端地址。
 *
 * `trustProxy` 为 false 时只用 socket 地址（Hono 拿不到时返回 undefined），
 * 这样伪造的 `X-Forwarded-For` 不会影响指纹。
 */
export function resolveClientAddress(input: {
  remoteAddress?: string;
  forwardedFor?: string;
  trustProxy: boolean;
}): string | undefined {
  if (input.trustProxy && input.forwardedFor) {
    // 取**最后**一个地址：那是我们自己那台可信代理（Caddy）追加的、真实的客户端地址。
    // 不能取最左边：客户端可以自己先塞一个 X-Forwarded-For，代理追加后左边就是伪造值。
    const parts = input.forwardedFor.split(',');
    const last = parts[parts.length - 1]?.trim();
    if (last) {
      return last;
    }
  }
  return input.remoteAddress;
}

export function fingerprintAddress(address: string, secret: string): string | undefined {
  const normalized = normalizeAddress(address);
  if (normalized === undefined) {
    return undefined;
  }
  return createHmac('sha256', secret).update(normalized).digest('hex').slice(0, 16);
}

export function computeFingerprint(
  options: FingerprintOptions,
  address: string | undefined,
): FingerprintResult {
  if (!options.secret) {
    return { available: false, reason: '未配置指纹 secret' };
  }
  if (!address) {
    return { available: false, reason: '拿不到可靠的客户端地址' };
  }
  const fingerprint = fingerprintAddress(address, options.secret);
  if (fingerprint === undefined) {
    return { available: false, reason: '地址格式无法规范化' };
  }
  return { available: true, fingerprint };
}
