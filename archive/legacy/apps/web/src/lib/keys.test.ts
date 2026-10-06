import { describe, expect, it } from 'vitest';

import { isEditableElement, moveIndex, resolveSearchKey, shouldFocusSearch } from './keys';

describe('resolveSearchKey', () => {
  it('moves through results and opens the highlighted one', () => {
    expect(resolveSearchKey({ key: 'ArrowDown', resultCount: 3 })).toBe('next');
    expect(resolveSearchKey({ key: 'ArrowUp', resultCount: 3 })).toBe('previous');
    expect(resolveSearchKey({ key: 'Enter', resultCount: 3 })).toBe('open');
  });

  it('ignores navigation keys when there are no results', () => {
    expect(resolveSearchKey({ key: 'ArrowDown', resultCount: 0 })).toBe('ignore');
    expect(resolveSearchKey({ key: 'ArrowUp', resultCount: 0 })).toBe('ignore');
    expect(resolveSearchKey({ key: 'Enter', resultCount: 0 })).toBe('ignore');
  });

  it('does not treat Enter as confirmation while an input method is composing', () => {
    expect(resolveSearchKey({ key: 'Enter', resultCount: 5, isComposing: true })).toBe('ignore');
    expect(resolveSearchKey({ key: 'ArrowDown', resultCount: 5, isComposing: true })).toBe(
      'ignore',
    );
  });

  it('closes on Escape, with or without results', () => {
    expect(resolveSearchKey({ key: 'Escape', resultCount: 0 })).toBe('close');
    expect(resolveSearchKey({ key: 'Escape', resultCount: 5 })).toBe('close');
  });

  it('ignores unrelated keys so normal typing is unaffected', () => {
    for (const key of ['a', 'Shift', 'Tab', 'Backspace', ' ']) {
      expect(resolveSearchKey({ key, resultCount: 5 })).toBe('ignore');
    }
  });
});

describe('shouldFocusSearch', () => {
  it('wakes up on a bare slash outside input fields', () => {
    expect(shouldFocusSearch({ key: '/', isEditable: false })).toBe(true);
  });

  it('does not hijack a slash typed inside an input or textarea', () => {
    expect(shouldFocusSearch({ key: '/', isEditable: true })).toBe(false);
  });

  it('ignores slash combined with modifiers', () => {
    expect(shouldFocusSearch({ key: '/', ctrlKey: true })).toBe(false);
    expect(shouldFocusSearch({ key: '/', metaKey: true })).toBe(false);
    expect(shouldFocusSearch({ key: '/', altKey: true })).toBe(false);
  });

  it('wakes up on Ctrl+K and Cmd+K even while typing elsewhere', () => {
    expect(shouldFocusSearch({ key: 'k', ctrlKey: true, isEditable: true })).toBe(true);
    expect(shouldFocusSearch({ key: 'K', metaKey: true })).toBe(true);
    expect(shouldFocusSearch({ key: 'k' })).toBe(false);
  });

  it('stays quiet while an input method is composing', () => {
    expect(shouldFocusSearch({ key: 'k', ctrlKey: true, isComposing: true })).toBe(false);
    expect(shouldFocusSearch({ key: '/', isComposing: true })).toBe(false);
  });
});

describe('isEditableElement', () => {
  const element = (tagName: string, type?: string, isContentEditable = false) => ({
    tagName,
    isContentEditable,
    getAttribute: (name: string) => (name === 'type' ? (type ?? null) : null),
  });

  it('recognises text inputs, textareas and contenteditable', () => {
    expect(isEditableElement(element('input'))).toBe(true);
    expect(isEditableElement(element('textarea'))).toBe(true);
    expect(isEditableElement(element('div', undefined, true))).toBe(true);
  });

  it('does not treat buttons and checkboxes as text entry', () => {
    expect(isEditableElement(element('input', 'checkbox'))).toBe(false);
    expect(isEditableElement(element('input', 'submit'))).toBe(false);
    expect(isEditableElement(element('button'))).toBe(false);
    expect(isEditableElement(element('body'))).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });
});

describe('moveIndex', () => {
  it('wraps around in both directions', () => {
    expect(moveIndex(-1, 1, 3)).toBe(0);
    expect(moveIndex(-1, -1, 3)).toBe(2);
    expect(moveIndex(2, 1, 3)).toBe(0);
    expect(moveIndex(0, -1, 3)).toBe(2);
  });

  it('stays empty when there is nothing to select', () => {
    expect(moveIndex(0, 1, 0)).toBe(-1);
    expect(moveIndex(-1, -1, 0)).toBe(-1);
  });
});
