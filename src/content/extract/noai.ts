/**
 * Detect AI opt-out meta tags. The architecture (§10.4) lists pages with
 * `<meta name="robots" content="noai">` (and equivalent signals) as part
 * of the default blocklist: even on a domain the user enabled, individual
 * pages can request that Pagewise not send their content to Anthropic.
 *
 * Honored sources:
 *   - <meta name="robots" content="…">
 *   - <meta name="googlebot" content="…">
 *   - <meta name="bingbot" content="…">
 *
 * Honored tokens (case-insensitive, comma-separated content):
 *   noai
 *   noimageai
 *
 * Other robots directives (noindex, nofollow, nosnippet, etc.) DO NOT
 * trigger this — they're indexing-related, not AI-opt-out.
 */

const HONORED_NAMES = ['robots', 'googlebot', 'bingbot'] as const;
const HONORED_TOKENS = new Set(['noai', 'noimageai']);

export interface NoAiSignal {
  /** Which meta tag the signal came from. */
  source: (typeof HONORED_NAMES)[number];
  /** The full content attribute value (lower-cased, trimmed) for diagnostics. */
  content: string;
  /** The first matching token from HONORED_TOKENS. */
  token: string;
}

export function detectNoAi(doc: Document): NoAiSignal | null {
  for (const name of HONORED_NAMES) {
    const metas = doc.querySelectorAll<HTMLMetaElement>(
      `meta[name="${name}" i]`
    );
    for (const meta of Array.from(metas)) {
      const content = (meta.getAttribute('content') ?? '').toLowerCase().trim();
      if (content === '') continue;
      for (const token of content.split(/[\s,]+/)) {
        if (HONORED_TOKENS.has(token)) {
          return { source: name, content, token };
        }
      }
    }
  }
  return null;
}
