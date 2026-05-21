import type { NodeRef } from '@/schemas/node-ref';
import { resolveRef, type ResolveOutcome } from './refs/resolve';
import type { RefRegistry } from './refs/registry';
import { isProgrammaticallyFocusable } from './dom-accessibility/focusability';
import { computeRole } from './dom-accessibility/compute-role';
import { computeName } from './dom-accessibility/compute-name';

export type JumpedSummary = {
  role: string;
  name: string;
  tag: string;
};

export type JumpResult =
  | {
      kind: 'jumped';
      method: 'exact' | 'hint_match' | 'fallback';
      confidence: number;
      element: JumpedSummary;
    }
  | {
      kind: 'failed';
      reason: 'not_resolved' | 'no_focusable_target' | 'low_confidence';
    };

export interface JumpOptions {
  document?: Document;
  /**
   * Confidence floor for jumps. Anything below this is treated as a failed
   * jump so the side panel can announce uncertainty rather than land the
   * user somewhere wrong. Defaults to 0.5 per architecture §7.
   */
  confidenceThreshold?: number;
}

/**
 * Resolve a {@link NodeRef} to a live element and move focus + scroll to
 * it. Handles the "non-focusable target" case by temporarily applying
 * `tabindex="-1"`, then restoring the original value on the next blur so
 * the host page DOM is unchanged at rest. See architecture.md §7.
 */
export function jumpToRef(
  ref: NodeRef,
  registry: RefRegistry,
  options: JumpOptions = {}
): JumpResult {
  const outcome: ResolveOutcome = resolveRef(ref, registry, {
    ...(options.document !== undefined ? { document: options.document } : {}),
  });
  if (outcome.method === 'failed' || outcome.element === null) {
    return { kind: 'failed', reason: 'not_resolved' };
  }

  const threshold = options.confidenceThreshold ?? 0.5;
  if (outcome.confidence < threshold) {
    return { kind: 'failed', reason: 'low_confidence' };
  }

  const target = outcome.element;
  const focusable = makeFocusableTemporarily(target);
  if (focusable === null) {
    return { kind: 'failed', reason: 'no_focusable_target' };
  }

  try {
    focusable.focus({ preventScroll: true });
  } catch {
    return { kind: 'failed', reason: 'no_focusable_target' };
  }

  if (typeof focusable.scrollIntoView === 'function') {
    try {
      focusable.scrollIntoView({ block: 'center' });
    } catch {
      /* jsdom and some browsers may not support; non-fatal */
    }
  }

  return {
    kind: 'jumped',
    method: outcome.method,
    confidence: outcome.confidence,
    element: {
      role: computeRole(target).role,
      name: computeName(target).name,
      tag: target.tagName.toLowerCase(),
    },
  };
}

/**
 * Ensure the element can take focus. If it already can, return as-is.
 * Otherwise apply `tabindex="-1"` and register a one-shot blur listener
 * that restores the original tabindex state, so the host DOM ends up
 * exactly where it started after focus moves on.
 */
function makeFocusableTemporarily(element: Element): HTMLElement | null {
  if (typeof (element as HTMLElement).focus !== 'function') return null;

  if (isProgrammaticallyFocusable(element)) return element as HTMLElement;

  const original = element.getAttribute('tabindex');
  element.setAttribute('tabindex', '-1');

  const restore = (): void => {
    if (original === null) {
      element.removeAttribute('tabindex');
    } else {
      element.setAttribute('tabindex', original);
    }
    element.removeEventListener('blur', restore);
  };
  element.addEventListener('blur', restore, { once: true });

  return element as HTMLElement;
}
