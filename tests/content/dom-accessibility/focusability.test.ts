import { describe, expect, it, beforeEach } from 'vitest';
import {
  isTabbable,
  isProgrammaticallyFocusable,
} from '@/content/dom-accessibility/focusability';

function only(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

describe('isTabbable', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns true for a button', () => {
    expect(isTabbable(only('<button>x</button>'))).toBe(true);
  });

  it('returns false for a disabled button', () => {
    expect(isTabbable(only('<button disabled>x</button>'))).toBe(false);
  });

  it('returns false for aria-disabled="true"', () => {
    expect(isTabbable(only('<button aria-disabled="true">x</button>'))).toBe(false);
  });

  it('returns true for <a href>', () => {
    expect(isTabbable(only('<a href="/x">x</a>'))).toBe(true);
  });

  it('returns false for <a> without href', () => {
    expect(isTabbable(only('<a>x</a>'))).toBe(false);
  });

  it('returns true for input that is not disabled', () => {
    expect(isTabbable(only('<input type="text" />'))).toBe(true);
  });

  it('returns true for tabindex="0"', () => {
    expect(isTabbable(only('<div tabindex="0">x</div>'))).toBe(true);
  });

  it('returns true for tabindex="3"', () => {
    expect(isTabbable(only('<div tabindex="3">x</div>'))).toBe(true);
  });

  it('returns false for tabindex="-1"', () => {
    expect(isTabbable(only('<div tabindex="-1">x</div>'))).toBe(false);
  });

  it('returns true for video[controls]', () => {
    expect(isTabbable(only('<video controls></video>'))).toBe(true);
  });

  it('returns false for video without controls', () => {
    expect(isTabbable(only('<video></video>'))).toBe(false);
  });

  it('returns true for contenteditable element', () => {
    expect(isTabbable(only('<div contenteditable="true">x</div>'))).toBe(true);
  });

  it('returns false for a plain div', () => {
    expect(isTabbable(only('<div>x</div>'))).toBe(false);
  });
});

describe('isProgrammaticallyFocusable', () => {
  it('returns true for tabindex="-1"', () => {
    expect(isProgrammaticallyFocusable(only('<div tabindex="-1">x</div>'))).toBe(true);
  });

  it('returns true for a button', () => {
    expect(isProgrammaticallyFocusable(only('<button>x</button>'))).toBe(true);
  });

  it('returns false for a plain heading without tabindex', () => {
    expect(isProgrammaticallyFocusable(only('<h2>x</h2>'))).toBe(false);
  });

  it('returns false for disabled controls even with tabindex', () => {
    expect(
      isProgrammaticallyFocusable(only('<button disabled tabindex="-1">x</button>'))
    ).toBe(false);
  });
});
