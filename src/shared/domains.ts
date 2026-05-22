/**
 * Domain validation, normalization, and the sensitive-domain registry that
 * gates "Send to Anthropic" prompts. See architecture.md §10.3 and §10.4.
 */

export type SensitiveCategory =
  | 'banking'
  | 'brokerage'
  | 'payment'
  | 'health'
  | 'government'
  | 'tax';

export type DomainNormalization =
  | { kind: 'ok'; host: string }
  | {
      kind: 'invalid';
      reason: 'empty' | 'malformed' | 'not_a_hostname' | 'privileged_scheme';
    };

/**
 * URL schemes Pagewise will never grant a content script on. Chrome itself
 * refuses the permission for most of these, but we reject them at the
 * input layer so the user gets a clear "no, you can't enable
 * chrome://settings" message rather than a silent failure or a misleading
 * "permission denied".
 */
const BLOCKED_SCHEMES = new Set<string>([
  'chrome',
  'chrome-extension',
  'about',
  'file',
  'view-source',
  'javascript',
  'data',
  'blob',
  'edge',
  'brave',
  'opera',
  'moz-extension',
  'safari-extension',
  'devtools',
]);

export type SensitivityCheck =
  | { sensitive: true; category: SensitiveCategory; matched: string }
  | { sensitive: false };

/**
 * Coerce whatever the user pasted into a canonical hostname. Accepts bare
 * hostnames ("example.com"), full URLs ("https://www.example.com/path"),
 * inputs with whitespace and casing variants. IDN inputs are normalized to
 * punycode via the WHATWG URL parser so we can stably store and match them.
 */
export function normalizeDomain(input: unknown): DomainNormalization {
  if (typeof input !== 'string') {
    return { kind: 'invalid', reason: 'malformed' };
  }
  const trimmed = input.trim();
  if (trimmed === '') return { kind: 'invalid', reason: 'empty' };

  // Hard-block privileged schemes BEFORE we attempt URL parsing. Catching
  // these early lets us return a specific reason the UI can explain rather
  // than letting them parse into something weird like a "settings" host.
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+\-.]*):/i);
  if (schemeMatch !== null) {
    const scheme = schemeMatch[1]!.toLowerCase();
    if (BLOCKED_SCHEMES.has(scheme)) {
      return { kind: 'invalid', reason: 'privileged_scheme' };
    }
  }

  let url: URL | null = null;
  try {
    url = new URL(trimmed);
  } catch {
    // If the input already contains a scheme separator and didn't parse,
    // it's a malformed URL, not a bare hostname. Reject rather than
    // double-prefixing — `new URL('https://http://')` parses with
    // hostname "http", which is not what the user meant.
    if (trimmed.includes('://')) {
      return { kind: 'invalid', reason: 'malformed' };
    }
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return { kind: 'invalid', reason: 'malformed' };
    }
  }

  // Defensive second check: if the parsed URL itself uses a blocked
  // scheme (e.g., the user pasted "file:///path"), reject.
  const parsedScheme = url.protocol.replace(/:$/, '').toLowerCase();
  if (BLOCKED_SCHEMES.has(parsedScheme)) {
    return { kind: 'invalid', reason: 'privileged_scheme' };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === '') return { kind: 'invalid', reason: 'not_a_hostname' };
  if (!isPlausibleHostname(host)) {
    return { kind: 'invalid', reason: 'not_a_hostname' };
  }
  return { kind: 'ok', host };
}

function isPlausibleHostname(host: string): boolean {
  // Hostnames after WHATWG parsing are ASCII (punycode for IDNs). Letters,
  // digits, hyphen, dot; numeric for IPv4; brackets for IPv6.
  if (host.startsWith('[') && host.endsWith(']')) return true; // IPv6
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host);
}

/**
 * Build the chrome.permissions origin pattern for a hostname. Defaults to
 * https because we don't trust http for arbitrary user content; callers
 * that explicitly want http (local development) can pass it.
 */
export function buildOriginPattern(
  host: string,
  scheme: 'https' | 'http' = 'https'
): string {
  return `${scheme}://${host}/*`;
}

const SENSITIVE_DOMAINS: ReadonlyArray<{
  suffix: string;
  category: SensitiveCategory;
}> = [
  // Banking
  { suffix: 'chase.com', category: 'banking' },
  { suffix: 'bankofamerica.com', category: 'banking' },
  { suffix: 'wellsfargo.com', category: 'banking' },
  { suffix: 'citi.com', category: 'banking' },
  { suffix: 'capitalone.com', category: 'banking' },
  { suffix: 'usbank.com', category: 'banking' },
  { suffix: 'pnc.com', category: 'banking' },
  // Brokerages
  { suffix: 'fidelity.com', category: 'brokerage' },
  { suffix: 'vanguard.com', category: 'brokerage' },
  { suffix: 'schwab.com', category: 'brokerage' },
  { suffix: 'etrade.com', category: 'brokerage' },
  { suffix: 'robinhood.com', category: 'brokerage' },
  // Payment
  { suffix: 'paypal.com', category: 'payment' },
  { suffix: 'venmo.com', category: 'payment' },
  { suffix: 'stripe.com', category: 'payment' },
  // Health
  { suffix: 'kp.org', category: 'health' },
  { suffix: 'mychart.com', category: 'health' },
  { suffix: 'mayoclinic.org', category: 'health' },
  { suffix: 'epic.com', category: 'health' },
  // Government
  { suffix: 'healthcare.gov', category: 'government' },
  { suffix: 'irs.gov', category: 'government' },
  { suffix: 'ssa.gov', category: 'government' },
  { suffix: 'medicare.gov', category: 'government' },
  // Tax
  { suffix: 'turbotax.com', category: 'tax' },
  { suffix: 'hrblock.com', category: 'tax' },
  { suffix: 'taxact.com', category: 'tax' },
];

/**
 * Suffix-match against the sensitive registry. "chase.com" matches both
 * "chase.com" itself and "online.chase.com"; it does not match "chasers.com".
 *
 * The list is intentionally small for Phase 0. Expanding the registry — and
 * sourcing it from a maintained data file rather than this hard-coded array
 * — is a Phase 1 task. Adding entries here is safe; removing them is a
 * trust regression and must be deliberate.
 */
export function isSensitiveDomain(host: string): SensitivityCheck {
  const normalized = host.toLowerCase().replace(/\.$/, '');
  for (const entry of SENSITIVE_DOMAINS) {
    if (
      normalized === entry.suffix ||
      normalized.endsWith(`.${entry.suffix}`)
    ) {
      return {
        sensitive: true,
        category: entry.category,
        matched: entry.suffix,
      };
    }
  }
  return { sensitive: false };
}

/**
 * Read-only view of the sensitive list for UI surfaces that want to render
 * it (e.g., "See the full list" in options).
 */
export function listSensitiveDomains(): ReadonlyArray<{
  suffix: string;
  category: SensitiveCategory;
}> {
  return SENSITIVE_DOMAINS;
}
