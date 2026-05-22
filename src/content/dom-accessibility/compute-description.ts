import { computeAccessibleDescription } from 'dom-accessibility-api';

/**
 * Compute the accessible description for an element using the WAI-ARIA
 * AccDescription algorithm (via `dom-accessibility-api`). Resolves
 * aria-describedby chains, falls back to title when present and no other
 * description applies. Returns an empty string when nothing resolves.
 *
 * Whitespace is collapsed and the result is trimmed so downstream
 * consumers can compare with `=== ''`.
 */
export function computeDescription(element: Element): string {
  let description = '';
  try {
    description = computeAccessibleDescription(element);
  } catch {
    description = '';
  }
  return description.replace(/\s+/g, ' ').trim();
}
