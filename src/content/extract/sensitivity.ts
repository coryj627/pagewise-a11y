import type {
  Redaction,
  RedactionKind,
  PageClassification,
} from '@/schemas/sensitivity-report';
import { isSensitiveDomain, type SensitiveCategory } from '@/shared/domains';

/**
 * The set of "kinds" {@link detectElementSensitivity} can identify. We
 * always omit the captured value at extraction time — Pagewise does not
 * mask or summarize sensitive form values, it just doesn't capture them.
 * See architecture.md §10.2.
 */
type ElementHit = {
  kind: Exclude<
    RedactionKind,
    'sensitive_domain' | 'token_like' | 'long_identifier' | 'form_value'
  >;
};

/**
 * Per-element sensitivity check. Returns a hit when the element is
 * something we want recorded in the SensitivityReport so the side panel
 * can communicate to the user (and so sensitive-page confirmations gate
 * Anthropic calls).
 */
export function detectElementSensitivity(element: Element): ElementHit | null {
  const tag = element.tagName.toLowerCase();
  const autocomplete = (
    element.getAttribute('autocomplete') ?? ''
  ).toLowerCase();
  const type = (element.getAttribute('type') ?? '').toLowerCase();

  if (tag === 'input') {
    if (type === 'password' || isPasswordAutocomplete(autocomplete)) {
      return { kind: 'password' };
    }
    if (isCreditCardAutocomplete(autocomplete)) {
      return { kind: 'credit_card' };
    }
    if (type === 'email' || autocomplete === 'email') {
      return { kind: 'email' };
    }
    if (type === 'tel' || autocomplete === 'tel' || autocomplete.startsWith('tel-')) {
      return { kind: 'phone' };
    }
    if (isAddressAutocomplete(autocomplete)) {
      return { kind: 'address' };
    }
  }

  if (isContentEditableWithContent(element)) {
    return { kind: 'contenteditable' };
  }

  return null;
}

function isPasswordAutocomplete(value: string): boolean {
  return value === 'current-password' || value === 'new-password';
}

function isCreditCardAutocomplete(value: string): boolean {
  // autocomplete=cc-number, cc-name, cc-exp, cc-csc, cc-exp-month, etc.
  return value.startsWith('cc-');
}

function isAddressAutocomplete(value: string): boolean {
  return (
    value === 'street-address' ||
    value.startsWith('address-') ||
    value === 'postal-code' ||
    value === 'country' ||
    value === 'country-name'
  );
}

function isContentEditableWithContent(element: Element): boolean {
  const ce = element.getAttribute('contenteditable');
  if (ce === null || ce === 'false') return false;
  const text = (element.textContent ?? '').trim();
  return text.length > 0;
}

// ─────────────────────────────────────────────────────────
// Page-level classification
// ─────────────────────────────────────────────────────────

/**
 * Decide PageClassification from collected hits + the host. Priority order
 * (highest wins) reflects what the user most needs to know before sending
 * page content to Anthropic. Credential-bearing pages always win.
 */
export function classifyPage(input: {
  hits: ReadonlyArray<{ kind: RedactionKind }>;
  host?: string;
}): PageClassification {
  const kinds = new Set(input.hits.map((h) => h.kind));

  if (kinds.has('password') || kinds.has('credit_card')) {
    return kinds.has('password') ? 'credential_likely' : 'financial_likely';
  }

  const domainCategory = input.host !== undefined ? domainCategoryFor(input.host) : null;
  if (domainCategory === 'banking' || domainCategory === 'brokerage' || domainCategory === 'payment') {
    return 'financial_likely';
  }
  if (domainCategory === 'health') {
    return 'health_likely';
  }
  if (domainCategory === 'government' || domainCategory === 'tax') {
    // Government/tax data is sensitive; closest schema fit is personal_data.
    return 'personal_data_likely';
  }

  if (
    kinds.has('email') ||
    kinds.has('phone') ||
    kinds.has('address') ||
    kinds.has('contenteditable')
  ) {
    return 'personal_data_likely';
  }

  return 'public_likely';
}

function domainCategoryFor(host: string): SensitiveCategory | null {
  const check = isSensitiveDomain(host);
  return check.sensitive ? check.category : null;
}

// ─────────────────────────────────────────────────────────
// Building Redaction entries
// ─────────────────────────────────────────────────────────

export function buildRedaction(
  ref: Redaction['ref'],
  hit: ElementHit
): Redaction {
  return { ref, kind: hit.kind, action: 'omitted' };
}

/**
 * Builds the sensitive_domain redaction entry when the host matches the
 * curated sensitive registry. The ref points to a representative element
 * (typically the document root) so the side panel can show the user where
 * the categorization came from.
 */
export function buildSensitiveDomainRedaction(
  ref: Redaction['ref'],
  host: string
): Redaction | null {
  const check = isSensitiveDomain(host);
  if (!check.sensitive) return null;
  return { ref, kind: 'sensitive_domain', action: 'summarized' };
}
