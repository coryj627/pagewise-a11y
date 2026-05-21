/**
 * Should this element be omitted from the extracted PageElement tree?
 * The check is local to the element itself; the walker handles ancestor
 * pruning by short-circuiting when {@link isHidden} returns true for a
 * branch.
 *
 * Mirrors how a screen reader would treat hidden content: aria-hidden,
 * the HTML `hidden` attribute, display:none, visibility:hidden|collapse.
 * Layout-based heuristics (opacity:0, bbox=0) are intentionally skipped —
 * they produce too many false positives (CSS transitions, off-canvas
 * navigation, position:fixed widgets).
 */
export function isHidden(element: Element, view?: Window | null): boolean {
  if (element.getAttribute('aria-hidden') === 'true') return true;

  // The HTML `hidden` attribute + the IDL property both flag the element.
  if ((element as HTMLElement).hidden === true) return true;

  // getComputedStyle requires a window. In jsdom and during ordinary
  // browser extraction we always have one; the fallback keeps this safe
  // when callers pass null deliberately (unit tests of pure logic).
  const win = view ?? element.ownerDocument?.defaultView ?? null;
  if (!win) return false;

  const style = win.getComputedStyle(element);
  if (style.display === 'none') return true;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return true;

  return false;
}

/**
 * Does this element exist purely for presentation (role="presentation" or
 * role="none")? Such elements have their semantics suppressed but their
 * children still participate in the tree.
 */
export function isPresentational(element: Element): boolean {
  const role = element.getAttribute('role');
  return role === 'presentation' || role === 'none';
}
