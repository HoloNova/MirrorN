export type SearchKeyAction = 'next' | 'previous' | 'open' | 'close' | 'ignore';

/**
 * 键盘行为只在一处判定，便于单独测试输入法这类无法在 E2E 里稳定复现的情况。
 * `isComposing` 为真时说明输入法正在组词，Enter 属于输入法，不能当作确认。
 */
export function resolveSearchKey(input: {
  key: string;
  isComposing?: boolean;
  resultCount: number;
}): SearchKeyAction {
  if (input.isComposing) {
    return 'ignore';
  }

  switch (input.key) {
    case 'ArrowDown':
      return input.resultCount > 0 ? 'next' : 'ignore';
    case 'ArrowUp':
      return input.resultCount > 0 ? 'previous' : 'ignore';
    case 'Enter':
      return input.resultCount > 0 ? 'open' : 'ignore';
    case 'Escape':
      return 'close';
    default:
      return 'ignore';
  }
}

/**
 * `/` 与 Ctrl/Cmd+K 的全局唤起。在输入框、文本域或可编辑区域里不劫持 `/`，
 * 否则用户就没法正常输入路径或斜杠。
 */
export function shouldFocusSearch(input: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isEditable?: boolean;
  isComposing?: boolean;
}): boolean {
  if (input.isComposing) {
    return false;
  }

  if (input.key === 'k' || input.key === 'K') {
    return input.ctrlKey === true || input.metaKey === true;
  }

  if (input.key !== '/') {
    return false;
  }

  return (
    input.isEditable !== true &&
    input.ctrlKey !== true &&
    input.metaKey !== true &&
    input.altKey !== true
  );
}

/** 焦点是否落在可输入的位置，用于决定是否劫持快捷键。 */
export function isEditableElement(
  element: {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  } | null,
): boolean {
  if (!element) {
    return false;
  }

  if (element.isContentEditable === true) {
    return true;
  }

  const tag = element.tagName?.toLowerCase();
  if (tag === 'textarea' || tag === 'select') {
    return true;
  }

  if (tag === 'input') {
    const type = element.getAttribute?.('type')?.toLowerCase() ?? 'text';
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color'].includes(
      type,
    );
  }

  return false;
}

/** 上下键在结果列表中循环，不因为到边界就失去焦点。 */
export function moveIndex(current: number, delta: number, count: number): number {
  if (count <= 0) {
    return -1;
  }
  if (current < 0) {
    return delta > 0 ? 0 : count - 1;
  }
  return (current + delta + count) % count;
}
