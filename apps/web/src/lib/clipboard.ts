export type CopyResult = { ok: true } | { ok: false; message: string };

/**
 * 复制命令到剪贴板。剪贴板权限可能被浏览器拒绝（例如非安全上下文），
 * 因此失败时必须如实告知用户，而不是显示复制成功。
 */
export async function copyText(
  text: string,
  target: { navigator?: Navigator; document?: Document } = {},
): Promise<CopyResult> {
  const nav = target.navigator ?? globalThis.navigator;
  const doc = target.document ?? globalThis.document;

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return { ok: true };
    } catch {
      // 继续尝试回退方案
    }
  }

  if (!doc?.body) {
    return { ok: false, message: '当前环境不支持自动复制，请手动选择命令文本。' };
  }

  try {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    doc.body.appendChild(area);
    area.select();
    const copied = doc.execCommand('copy');
    doc.body.removeChild(area);

    return copied
      ? { ok: true }
      : { ok: false, message: '浏览器拒绝了复制请求，请手动选择命令文本。' };
  } catch {
    return { ok: false, message: '复制失败，请手动选择命令文本。' };
  }
}
