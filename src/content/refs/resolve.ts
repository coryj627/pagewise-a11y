import type { NodeRef } from '@/schemas/node-ref';
import { RefRegistry } from './registry';
import { hashName, hashText } from './hash';
import { computeName } from '../dom-accessibility/compute-name';
import { computeRole } from '../dom-accessibility/compute-role';

/**
 * Result of {@link resolveRef}. The `method` reports the resolution path
 * taken; the side panel uses it to decide whether to jump silently
 * (`exact`), announce uncertainty (`hint_match`/`fallback`), or skip the
 * jump entirely (`failed`).
 *
 * See architecture.md §7 "Re-resolution algorithm" for the contract.
 */
export type ResolveOutcome =
  | {
      method: 'exact';
      element: Element;
      confidence: 1;
    }
  | {
      method: 'hint_match';
      element: Element;
      confidence: number;
    }
  | {
      method: 'fallback';
      element: Element;
      confidence: number;
    }
  | {
      method: 'failed';
      element: null;
      confidence: 0;
    };

export type ResolveOptions = {
  /**
   * Explicit document to search when re-resolving against DOM. Defaults to
   * the owner document of any element still in the registry.
   */
  document?: Document;
};

/**
 * Re-resolve a {@link NodeRef} against the live DOM. Implements the
 * algorithm in architecture.md §7:
 *
 *   1. Live registry lookup — exact match if the element still belongs to
 *      the same extraction and is still attached.
 *   2. Selector hint match — try css then xpath; verify any candidate
 *      against role + name/text hashes before accepting.
 *   3. Aria + role fallback — scan the document for an element with the
 *      same role + accessible name. Used when the hint selectors miss
 *      (re-render, hydration, virtualization).
 *
 * The function NEVER mutates the DOM and NEVER falls back silently on
 * ambiguous matches: when multiple candidates remain after verification,
 * confidence is lowered so the side panel can refuse to jump.
 */
export function resolveRef(
  ref: NodeRef,
  registry: RefRegistry,
  options: ResolveOptions = {}
): ResolveOutcome {
  // Step 1 — live registry lookup.
  if (ref.extraction_id === registry.extractionId) {
    const live = registry.get(ref.id);
    if (live !== undefined && isAttached(live)) {
      return { method: 'exact', element: live, confidence: 1 };
    }
  }

  const doc = options.document ?? inferDocument(registry);
  if (doc === null) {
    return { method: 'failed', element: null, confidence: 0 };
  }

  // Step 2 — selector hint match (verified against role + hashes).
  const hint = tryHintMatch(ref, doc);
  if (hint !== null) return hint;

  // Step 3 — role + accessible name fallback across the document.
  const fallback = tryFallback(ref, doc);
  if (fallback !== null) return fallback;

  return { method: 'failed', element: null, confidence: 0 };
}

function tryHintMatch(ref: NodeRef, doc: Document): ResolveOutcome | null {
  const candidates = new Set<Element>();

  const { css, xpath } = ref.selector_hints;
  if (css !== undefined && css !== '') {
    try {
      doc.querySelectorAll(css).forEach((el) => candidates.add(el));
    } catch {
      /* invalid selector — fall through */
    }
  }
  if (candidates.size === 0 && xpath !== undefined && xpath !== '') {
    try {
      const it = doc.evaluate(
        xpath,
        doc,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      for (let i = 0; i < it.snapshotLength; i++) {
        const node = it.snapshotItem(i);
        if (node !== null && node.nodeType === 1) candidates.add(node as Element);
      }
    } catch {
      /* malformed xpath */
    }
  }

  const verified = Array.from(candidates).filter((el) =>
    matchesHashes(el, ref.hashes)
  );

  if (verified.length === 1) {
    return { method: 'hint_match', element: verified[0]!, confidence: 0.9 };
  }
  if (verified.length > 1) {
    // Multiple matches — pick the first to be deterministic but flag low
    // confidence so the caller can decide not to jump.
    return { method: 'hint_match', element: verified[0]!, confidence: 0.6 };
  }
  return null;
}

function tryFallback(ref: NodeRef, doc: Document): ResolveOutcome | null {
  if (ref.hashes.name_hash === undefined) {
    // Without an accessible name, role alone is too ambiguous to trust.
    return null;
  }

  const matching: Element[] = [];
  const all = doc.querySelectorAll<Element>('*');
  for (const el of Array.from(all)) {
    if (computeRole(el).role !== ref.hashes.role) continue;
    if (hashName(computeName(el).name) !== ref.hashes.name_hash) continue;
    matching.push(el);
  }

  if (matching.length === 1) {
    return { method: 'fallback', element: matching[0]!, confidence: 0.7 };
  }
  if (matching.length > 1) {
    return {
      method: 'fallback',
      element: matching[0]!,
      confidence: 0.4,
    };
  }
  return null;
}

function matchesHashes(el: Element, hashes: NodeRef['hashes']): boolean {
  if (computeRole(el).role !== hashes.role) return false;
  if (hashes.name_hash !== undefined) {
    if (hashName(computeName(el).name) !== hashes.name_hash) return false;
  }
  if (hashes.text_hash !== undefined) {
    if (hashText(directTextContent(el)) !== hashes.text_hash) return false;
  }
  return true;
}

function directTextContent(element: Element): string {
  let s = '';
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === 3) s += node.nodeValue ?? '';
  }
  return s.replace(/\s+/g, ' ').trim();
}

function isAttached(element: Element): boolean {
  const doc = element.ownerDocument;
  return doc !== null && doc.contains(element);
}

function inferDocument(registry: RefRegistry): Document | null {
  for (const [, el] of registry.entries()) {
    if (el.ownerDocument !== null) return el.ownerDocument;
  }
  return null;
}
