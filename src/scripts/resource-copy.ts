function prepareCopyButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy-button]')) button.hidden = false;
}

async function copyValue(button: HTMLButtonElement): Promise<void> {
  const region = button.closest<HTMLElement>('[data-copy-root]');
  const value = region?.querySelector<HTMLElement>('[data-copy-value]');
  const feedback = region?.querySelector<HTMLElement>('[data-copy-feedback]');
  if (!value || !feedback) return;
  button.disabled = true;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    // JSON 属性不受 HTML 文本的 CRLF 归一化影响；原始命令与换行完整保留。
    const original: unknown = JSON.parse(region?.dataset.copyText ?? 'null');
    if (typeof original !== 'string') throw new Error('Copy payload unavailable');
    await navigator.clipboard.writeText(original);
    feedback.textContent = '已复制';
  } catch {
    feedback.textContent = '无法自动复制，请在上方选择文字后手动复制。';
    value.focus();
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-copy-button]') : null;
  if (button && !button.disabled) void copyValue(button);
});
prepareCopyButtons();
document.addEventListener('astro:page-load', prepareCopyButtons);
