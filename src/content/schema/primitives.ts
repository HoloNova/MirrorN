import { z } from 'zod';

export const platformIds = ['windows', 'linux', 'macos', 'android', 'ios', 'freebsd', 'web', 'any'] as const;
export const architectureIds = ['x64', 'arm64', 'x86', 'armv7', 'riscv64', 'wasm', 'any'] as const;
export const originIds = ['official', 'github', 'gitlab', 'gitee', 'community'] as const;
export const formatIds = ['installer', 'binary', 'archive', 'image', 'text', 'notebook'] as const;
export const activeMediaTypes: readonly string[] = [
  'text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/css',
  'application/javascript', 'text/javascript', 'application/ecmascript', 'text/ecmascript',
  'application/x-javascript', 'application/x-ecmascript', 'text/x-javascript',
  'text/x-ecmascript', 'text/jscript', 'text/livescript',
];
export const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const idSchema = z.string().min(1).max(80).regex(idPattern, '使用小写 ASCII 字母、数字和单连字符');

export function textSchema(maxLength: number) {
  return z.string().trim().min(1).max(maxLength).refine(
    (value) => !/[\u0000-\u001f\u007f]/u.test(value), '纯文本字段不能包含换行或控制字符',
  ).refine((value) => value.isWellFormed(), '字符串必须是有效 Unicode');
}

export const labelSchema = textSchema(120);
// 命令和多行说明保持原文，只验证；不 trim、拆解或重新拼接安装命令。
export const multilineTextSchema = z.string().min(1).max(16_384)
  .refine((value) => value.trim().length > 0, '不能仅包含空白')
  .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value), '不能包含控制字符')
  .refine((value) => value.isWellFormed(), '字符串必须是有效 Unicode');

export function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export function uniqueStrings<T extends z.ZodType<string>>(schema: T) {
  return z.array(schema).refine(hasUniqueValues, '数组不得有重复值');
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}

export const dateSchema = z.string().refine(isCalendarDate, '必须是真实日历日期 YYYY-MM-DD');

/** 不探测外网；这里只判断可公开展示的地址格式，不把签名凭据写进资源仓库。 */
export function httpUrlProblem(value: string): string | undefined {
  if (!value.isWellFormed()) return 'URL 必须是有效 Unicode';
  if (value !== value.trim() || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return 'URL 不得包含空白、控制字符或反斜杠';
  let url: URL;
  try { url = new URL(value); } catch { return '必须是完整 HTTP(S) URL'; }
  if (!['http:', 'https:'].includes(url.protocol) || !/^https?:\/\//i.test(value)) return '仅允许完整 HTTP(S) URL';
  if (url.username || url.password) return 'URL 不得包含用户名或密码';
  const privateKeys = /^(?:access[_-]?token|auth[_-]?token|api[_-]?key|token|auth|authorization|password|passwd|secret|credential|client[_-]?secret|sig|signature|x-amz-credential|x-amz-signature|x-goog-credential|x-goog-signature)$/i;
  if ([...url.searchParams.keys()].some((key) => privateKeys.test(key))) return 'URL 不得包含私有访问凭据；请提供公开稳定入口';
  return undefined;
}

export const httpUrlSchema = z.string().max(4096).superRefine((value, context) => {
  const message = httpUrlProblem(value);
  if (message) context.addIssue({ code: 'custom', message });
});

export function assetPathProblem(value: string): string | undefined {
  const path = value.startsWith('./') ? value.slice(2) : value;
  if (!path.isWellFormed()) return '附件路径必须是有效 Unicode';
  if (!path.startsWith('assets/')) return '本地文件必须位于当前资源的 assets/ 内';
  if (/[\u0000-\u001f\u007f\\:*?"<>|]/u.test(path)) return '文件路径不得包含控制字符、反斜杠或非法文件名字符';
  if (path.split('/').some((part) => !part || part === '.' || part === '..')) return '路径不得有空段、. 或 ..';
  return undefined;
}

export const assetPathSchema = z.string().min(1).max(512).superRefine((value, context) => {
  const message = assetPathProblem(value);
  if (message) context.addIssue({ code: 'custom', message });
}).transform((value) => value.startsWith('./') ? value.slice(2) : value);

export const fileNameSchema = textSchema(240).refine(
  (value) => !/[\\/:*?"<>|]/u.test(value) && value !== '.' && value !== '..', '必须是文件名，不是路径',
);
