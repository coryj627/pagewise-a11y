/**
 * Redact token-shaped segments from a URL pathname so we never store or
 * send a raw ID/UUID/JWT to Anthropic. Returns a path "shape" suitable for
 * comparison and logging.
 *
 *   /orders/abcd1234-5678-... → /orders/:id
 *   /users/12345678           → /users/:id
 *   /articles/the-best-coffee → /articles/the-best-coffee  (untouched)
 *   /api/v1/data/eyJhbGciOi…  → /api/v1/data/:id
 *
 * See architecture.md §10.2 — URL query parameters are never captured at
 * all; only the path is reduced.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX_PATTERN = /^[0-9a-f]{12,}$/i;
const NUMERIC_ID_PATTERN = /^\d{8,}$/;
const JWT_PREFIX = /^eyJ[A-Za-z0-9_-]{10,}/;

export function redactUrlPath(pathname: string): string {
  if (pathname === '' || pathname === '/') return pathname;
  const parts = pathname.split('/');
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg === undefined || seg === '') continue;
    if (
      UUID_PATTERN.test(seg) ||
      LONG_HEX_PATTERN.test(seg) ||
      NUMERIC_ID_PATTERN.test(seg) ||
      JWT_PREFIX.test(seg)
    ) {
      parts[i] = ':id';
    }
  }
  return parts.join('/');
}
