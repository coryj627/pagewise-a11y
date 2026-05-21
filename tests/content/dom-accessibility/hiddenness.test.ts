import { describe, expect, it, beforeEach } from 'vitest';
import { isHidden, isPresentational } from '@/content/dom-accessibility/hiddenness';

describe('isHidden', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns false for a visible element', () => {
    document.body.innerHTML = '<div id="t">hi</div>';
    expect(isHidden(document.getElementById('t')!)).toBe(false);
  });

  it('returns true for aria-hidden="true"', () => {
    document.body.innerHTML = '<div id="t" aria-hidden="true">hi</div>';
    expect(isHidden(document.getElementById('t')!)).toBe(true);
  });

  it('returns false for aria-hidden="false"', () => {
    document.body.innerHTML = '<div id="t" aria-hidden="false">hi</div>';
    expect(isHidden(document.getElementById('t')!)).toBe(false);
  });

  it('returns true for the HTML hidden attribute', () => {
    document.body.innerHTML = '<div id="t" hidden>hi</div>';
    expect(isHidden(document.getElementById('t')!)).toBe(true);
  });

  it('returns true for inline display: none', () => {
    document.body.innerHTML = '<div id="t" style="display: none">hi</div>';
    expect(isHidden(document.getElementById('t')!)).toBe(true);
  });

  it('returns true for inline visibility: hidden', () => {
    document.body.innerHTML = '<div id="t" style="visibility: hidden">hi</div>';
    expect(isHidden(document.getElementById('t')!)).toBe(true);
  });

  it('returns false for opacity: 0 (intentionally permissive)', () => {
    document.body.innerHTML = '<div id="t" style="opacity: 0">hi</div>';
    expect(isHidden(document.getElementById('t')!)).toBe(false);
  });

  it('does not consider ancestor display:none', () => {
    document.body.innerHTML =
      '<div style="display: none"><span id="t">hi</span></div>';
    // Walker handles ancestor pruning by short-circuiting; the helper itself
    // only checks the element's own state.
    expect(isHidden(document.getElementById('t')!)).toBe(false);
  });
});

describe('isPresentational', () => {
  it.each([
    ['<div role="presentation">x</div>', true],
    ['<div role="none">x</div>', true],
    ['<div role="generic">x</div>', false],
    ['<div>x</div>', false],
  ])('handles %s', (html, expected) => {
    document.body.innerHTML = html;
    expect(isPresentational(document.body.firstElementChild!)).toBe(expected);
  });
});
