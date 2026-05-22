import { computeRole } from './compute-role';

/**
 * Raw DOM-id collections from the aria-* relationship attributes on a
 * single element. The walker resolves these to NodeRef ids in a second
 * pass once every captured element has been registered.
 */
export interface AriaRelationshipDomIds {
  labelled_by?: string[];
  described_by?: string[];
  controls?: string[];
  owns?: string[];
}

const LANDMARK_ROLES = new Set([
  'banner',
  'complementary',
  'contentinfo',
  'form',
  'main',
  'navigation',
  'region',
  'search',
]);

export function collectAriaRelationships(element: Element): AriaRelationshipDomIds {
  const result: AriaRelationshipDomIds = {};
  const labelledBy = parseIdTokens(element.getAttribute('aria-labelledby'));
  if (labelledBy.length > 0) result.labelled_by = labelledBy;
  const describedBy = parseIdTokens(element.getAttribute('aria-describedby'));
  if (describedBy.length > 0) result.described_by = describedBy;
  const controls = parseIdTokens(element.getAttribute('aria-controls'));
  if (controls.length > 0) result.controls = controls;
  const owns = parseIdTokens(element.getAttribute('aria-owns'));
  if (owns.length > 0) result.owns = owns;
  return result;
}

/**
 * Walk up the DOM from `element`, returning the nearest ancestor with a
 * landmark role. Mirrors what a screen reader reports as the enclosing
 * region. Returns null when the element is not inside any landmark.
 */
export function nearestLandmarkAncestor(element: Element): Element | null {
  let cur = element.parentElement;
  while (cur !== null) {
    const { role } = computeRole(cur);
    if (LANDMARK_ROLES.has(role)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Parse a space-separated ID-reference list like aria-labelledby="a b c".
 * Empties + duplicates removed.
 */
function parseIdTokens(raw: string | null): string[] {
  if (raw === null) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.trim().split(/\s+/)) {
    if (token === '') continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}
