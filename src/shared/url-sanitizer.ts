/**
 * URL sanitizer for any URL captured from a host page before it is rendered
 * in the side panel or returned to the user. See architecture.md §10.6.
 *
 * Hard rule: the renderer NEVER displays a URL that has not been through
 * this sanitizer. Anything the sanitizer cannot prove safe is blocked.
 *
 * Inputs are expected to be absolute URLs already — the extractor resolves
 * relative URLs against the host page origin before sanitization. Anything
 * that doesn't parse as an absolute URL is blocked defensively, since a
 * relative URL rendered from a chrome-extension:// context would resolve
 * against the extension origin, not the host page.
 */

export type SafeScheme = 'http' | 'https' | 'mailto' | 'tel';

export const DEFAULT_ALLOWED_SCHEMES: readonly SafeScheme[] = [
  'http',
  'https',
] as const;

/**
 * Known XSS vectors. These are always blocked, even if a caller's
 * `allowSchemes` list mentions them — they don't get a vote.
 */
const DANGEROUS_SCHEMES = new Set<string>([
  'javascript',
  'data',
  'vbscript',
  'blob',
  'file',
  'about',
  'chrome',
  'chrome-extension',
  'view-source',
]);

export type SanitizeUrlOptions = {
  /**
   * Schemes the caller is willing to render in its context. Renderer body
   * content should pass ['http', 'https']. Metadata contexts (author email,
   * phone numbers) may add 'mailto' or 'tel'.
   *
   * Defaults to {@link DEFAULT_ALLOWED_SCHEMES}.
   */
  allowSchemes?: readonly SafeScheme[];
  /**
   * Origin of the host page the URL was extracted from. When provided, the
   * sanitizer marks the URL as external if its origin differs. Used by the
   * renderer to surface external links to the user.
   */
  pageOrigin?: string;
};

export type SanitizedUrl =
  | {
      kind: 'allowed';
      href: string;
      scheme: SafeScheme;
      origin: string;
      isExternal: boolean;
    }
  | {
      kind: 'blocked';
      reason: BlockReason;
    };

export type BlockReason =
  /** Input was empty or whitespace-only. */
  | 'empty'
  /** Input was not a string. */
  | 'malformed'
  /** URL did not parse as absolute (relative, protocol-relative, or junk). */
  | 'not_absolute'
  /** Scheme is on the dangerous-scheme blocklist (e.g., `javascript:`). */
  | 'dangerous_scheme'
  /** Scheme parsed cleanly but isn't in the caller's allow-list. */
  | 'disallowed_scheme';

/**
 * Sanitize an arbitrary string for use as an `href`. The result is a
 * discriminated union; callers must check `kind` before using `href`.
 *
 * The WHATWG URL parser is intentionally permissive — it normalizes
 * embedded tabs/newlines in the scheme and lowercases the protocol. The
 * sanitizer relies on that normalization, then applies its own allow/block
 * lists on top.
 */
export function sanitizeUrl(
  input: unknown,
  options: SanitizeUrlOptions = {}
): SanitizedUrl {
  if (typeof input !== 'string') {
    return { kind: 'blocked', reason: 'malformed' };
  }
  const trimmed = input.trim();
  if (trimmed === '') {
    return { kind: 'blocked', reason: 'empty' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { kind: 'blocked', reason: 'not_absolute' };
  }

  const scheme = url.protocol.slice(0, -1).toLowerCase();

  if (DANGEROUS_SCHEMES.has(scheme)) {
    return { kind: 'blocked', reason: 'dangerous_scheme' };
  }

  const allowed = options.allowSchemes ?? DEFAULT_ALLOWED_SCHEMES;
  if (!isSafeScheme(scheme) || !allowed.includes(scheme)) {
    return { kind: 'blocked', reason: 'disallowed_scheme' };
  }

  const isExternal =
    options.pageOrigin !== undefined ? url.origin !== options.pageOrigin : true;

  return {
    kind: 'allowed',
    href: url.toString(),
    scheme,
    origin: url.origin,
    isExternal,
  };
}

function isSafeScheme(scheme: string): scheme is SafeScheme {
  return (
    scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel'
  );
}
