/**
 * 站点级非机密配置的唯一来源。
 *
 * 为什么集中在这里：站点名称、正式地址和贡献仓库同时影响页面标题、canonical 和贡献入口，
 * 分散到各页面会被各自硬编码，改域名时容易漏改。这里只放公开信息，不放任何凭据。
 *
 * 未配置时的行为：`siteUrl` / `repositoryUrl` 保持 null，本地开发与构建照常完成，
 * 但不输出 canonical、不渲染仓库链接；加载配置时打印明确提示。
 * 首次公开发布前必须补全这些值（见 docs/delivery.md「首次公开发布门槛」）。
 *
 * 错误值不静默降级：写错的协议、相对地址、带凭据的地址或文档约定不使用的占位域名
 * (`example.com` 等) 会在配置加载阶段直接抛错，避免把假域名带进产物。
 */

export interface SiteConfig {
  /** 站点名称，用于页面标题和顶部品牌。 */
  readonly siteName: string;
  /** 正式站点根地址，作为 canonical 的来源；未配置时为 null。P1 不支持子路径部署。 */
  readonly siteUrl: string | null;
  /** 贡献仓库地址（PR 入口）；未配置时为 null。 */
  readonly repositoryUrl: string | null;
  /** 仓库默认分支，用于生成编辑链接；仓库未配置时为 null。 */
  readonly defaultBranch: string | null;
}

/** 配置写错时抛出，消息直接指出字段和期望格式，便于在构建日志中定位。 */
export class SiteConfigError extends Error {
  constructor(message: string) {
    super(`config/site.ts: ${message}`);
    this.name = 'SiteConfigError';
  }
}

/** 文档明确不作为真实站点的占位域名，配置里出现时视为错误而不是有效配置。 */
const placeholderHostnames = new Set(['example.com', 'example.net', 'example.org']);

const siteNameMaxLength = 60;
const defaultBranchMaxLength = 120;

function readTrimmedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SiteConfigError(`${field} 必须是非空字符串。`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new SiteConfigError(`${field} 不能超过 ${maxLength} 个字符。`);
  }
  return trimmed;
}

function readOptionalUrl(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  const text = readTrimmedText(value, field, 500);

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new SiteConfigError(`${field} 必须是绝对 URL（含 https:// 的完整地址），当前为 "${text}"。`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SiteConfigError(`${field} 只接受 http/https 地址，当前协议为 "${url.protocol}"。`);
  }
  if (url.username !== '' || url.password !== '') {
    throw new SiteConfigError(`${field} 不能包含用户名或密码。`);
  }
  if (placeholderHostnames.has(url.hostname)) {
    throw new SiteConfigError(
      `${field} 不能使用占位域名 "${url.hostname}"；未确定正式地址时请保持 null。`,
    );
  }
  if (url.search !== '' || url.hash !== '') {
    throw new SiteConfigError(`${field} 不能带查询参数或片段。`);
  }
  if (field === 'siteUrl' && url.pathname !== '/') {
    throw new SiteConfigError('siteUrl 当前只支持站点根地址，不能包含子路径；子路径部署需要同时配置构建 base 和全站链接。');
  }
  // 站点根地址去掉结尾斜杠；仓库地址保留实际仓库路径。
  return url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, ''));
}

export function validateSiteConfig(raw: {
  siteName: unknown;
  siteUrl: unknown;
  repositoryUrl: unknown;
  defaultBranch: unknown;
}): SiteConfig {
  const siteName = readTrimmedText(raw.siteName, 'siteName', siteNameMaxLength);
  const siteUrl = readOptionalUrl(raw.siteUrl, 'siteUrl');
  const repositoryUrl = readOptionalUrl(raw.repositoryUrl, 'repositoryUrl');
  const defaultBranch =
    raw.defaultBranch === null ? null : readTrimmedText(raw.defaultBranch, 'defaultBranch', defaultBranchMaxLength);

  if (repositoryUrl !== null && defaultBranch === null) {
    throw new SiteConfigError('配置了 repositoryUrl 时必须同时配置 defaultBranch。');
  }
  if (repositoryUrl === null && defaultBranch !== null) {
    throw new SiteConfigError('未配置 repositoryUrl 时不应单独配置 defaultBranch。');
  }

  return Object.freeze({ siteName, siteUrl, repositoryUrl, defaultBranch });
}

/** 返回当前缺失的正式配置提示；有值则不提示，避免每次构建都刷无意义警告。 */
export function describeUnconfiguredSiteConfig(config: SiteConfig): string[] {
  const warnings: string[] = [];
  if (config.siteUrl === null) {
    warnings.push('未配置 siteUrl：页面标题与链接仍然可用，但不会输出 canonical，也不能确定部署地址。');
  }
  if (config.repositoryUrl === null) {
    warnings.push('未配置 repositoryUrl：页面不显示贡献仓库入口，没有伪链接代替。');
  }
  if (warnings.length > 0) {
    warnings.push('正式发布前必须补全 config/site.ts，详见 docs/delivery.md 首次公开发布门槛。');
  }
  return warnings;
}

/** 仓库与默认分支已通过 origin 和远端 HEAD 核对；正式域名仍未确定。 */
export const siteConfig: SiteConfig = validateSiteConfig({
  siteName: 'MirrorN',
  siteUrl: null,
  repositoryUrl: 'https://github.com/HoloNova/MirrorN',
  defaultBranch: 'main',
});

export const siteConfigWarnings: string[] = describeUnconfiguredSiteConfig(siteConfig);
