/**
 * Is this element in the keyboard tab order? Mirrors the platform notion
 * of "tabbable": the user can reach it by pressing Tab.
 *
 * - Native focusable elements (`<a href>`, `<button>`, `<input>`, etc.)
 *   are tabbable unless disabled or `tabindex="-1"`.
 * - Any element with `tabindex >= 0` is tabbable.
 * - `tabindex < 0` is programmatically focusable but NOT in the tab
 *   order — we return false here. `isProgrammaticallyFocusable` covers
 *   that case for jump-to-element use.
 */
export function isTabbable(element: Element): boolean {
  if (isDisabled(element)) return false;

  const tabindex = parseTabindex(element);
  if (tabindex !== null) return tabindex >= 0;

  return isNativelyFocusable(element);
}

/**
 * Can the element receive focus at all (via `element.focus()`)? Includes
 * elements with `tabindex="-1"` that aren't in the tab order but can be
 * focused programmatically — important for jumps to headings, landmarks,
 * and other non-interactive content.
 */
export function isProgrammaticallyFocusable(element: Element): boolean {
  if (isDisabled(element)) return false;
  const tabindex = parseTabindex(element);
  if (tabindex !== null) return true;
  return isNativelyFocusable(element);
}

const FOCUSABLE_TAGS = new Set([
  'a',
  'audio',
  'button',
  'iframe',
  'input',
  'object',
  'select',
  'summary',
  'textarea',
  'video',
]);

function isNativelyFocusable(element: Element): boolean {
  const tag = element.tagName.toLowerCase();

  if (tag === 'a' || tag === 'area') return element.hasAttribute('href');

  if (tag === 'audio' || tag === 'video') return element.hasAttribute('controls');

  if (FOCUSABLE_TAGS.has(tag)) return true;

  const ce = element.getAttribute('contenteditable');
  if (ce !== null && ce !== 'false') return true;

  return false;
}

function isDisabled(element: Element): boolean {
  if ('disabled' in element && (element as HTMLInputElement).disabled === true) {
    return true;
  }
  if (element.getAttribute('aria-disabled') === 'true') return true;
  return false;
}

function parseTabindex(element: Element): number | null {
  if (!element.hasAttribute('tabindex')) return null;
  const raw = element.getAttribute('tabindex');
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}
