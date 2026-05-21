/**
 * EC-1 prototype: ref re-resolution survives common DOM mutations.
 *
 * Phase 0 exit criterion (see docs/plans/phase-0-spike.md §EC-1):
 *
 *   For each mutation scenario:
 *     - at least 4 of 5 saved jumps resolve to the same semantic element
 *       (by accessible name + role), OR fail safely with no silent wrong
 *       jump.
 *     - wrong-jump-without-warning count is ZERO.
 *
 * Scenarios:
 *   1. Re-render — section content is replaced with logically equivalent
 *      content (same headings, same names, same roles, different DOM
 *      nodes).
 *   2. Virtualized list scroll — items unmount/mount; some original items
 *      vanish from the DOM, equivalent ones appear with new names.
 *   3. Hydration — server-rendered HTML is replaced by client-side framework
 *      output: same semantic content wrapped in additional structural
 *      elements, different class names, equivalent roles.
 *
 * Tests in this file run in jsdom against hand-authored fixtures and serve
 * as the prototype for the Phase 0 acceptance harness. Real fixture-based
 * tests with browser screen-reader integration land in the Phase 0.5
 * deliverable.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { extractTree } from '@/content/extract/walker';
import { resolveRef } from '@/content/refs/resolve';
import { computeName } from '@/content/dom-accessibility/compute-name';
import { computeRole } from '@/content/dom-accessibility/compute-role';
import type { NodeRef } from '@/schemas/node-ref';
import type { PageElement } from '@/schemas/page-element';
import type { RefRegistry } from '@/content/refs/registry';

const CONFIDENCE_JUMP_THRESHOLD = 0.5;

interface SavedJump {
  /** Original ref captured before mutation. */
  ref: NodeRef;
  /** What the original element was, for "is this the same thing" verification. */
  originalRole: string;
  originalName: string;
}

function collectLeafRefs(
  el: PageElement,
  pred: (n: PageElement) => boolean,
  out: SavedJump[] = []
): SavedJump[] {
  if (pred(el) && el.name !== undefined) {
    out.push({
      ref: el.ref,
      originalRole: el.role,
      originalName: el.name,
    });
  }
  for (const c of el.children) collectLeafRefs(c, pred, out);
  return out;
}

function isSemanticallyEqual(
  resolved: Element,
  jump: SavedJump
): boolean {
  const role = computeRole(resolved).role;
  const name = computeName(resolved).name;
  return role === jump.originalRole && name === jump.originalName;
}

interface JumpAttempt {
  jump: SavedJump;
  method: string;
  confidence: number;
  semanticallyCorrect: boolean | null; // null when nothing was resolved
}

function attemptAll(jumps: SavedJump[], registry: RefRegistry): JumpAttempt[] {
  return jumps.map((j) => {
    const r = resolveRef(j.ref, registry, { document });
    if (r.method === 'failed') {
      return { jump: j, method: r.method, confidence: r.confidence, semanticallyCorrect: null };
    }
    return {
      jump: j,
      method: r.method,
      confidence: r.confidence,
      semanticallyCorrect: isSemanticallyEqual(r.element, j),
    };
  });
}

function assertNoSilentWrongJumps(attempts: JumpAttempt[]): void {
  for (const a of attempts) {
    if (a.method === 'failed') continue;
    if (a.confidence < CONFIDENCE_JUMP_THRESHOLD) continue;
    // High-confidence jump — it MUST be semantically correct.
    expect(a.semanticallyCorrect, `${a.method} (conf ${a.confidence}) for "${a.jump.originalName}" landed on the wrong element`).toBe(true);
  }
}

function countCorrectOrSafe(attempts: JumpAttempt[]): number {
  return attempts.filter(
    (a) =>
      a.semanticallyCorrect === true ||
      a.method === 'failed' ||
      a.confidence < CONFIDENCE_JUMP_THRESHOLD
  ).length;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('EC-1 scenario 1: section re-render', () => {
  function setupOriginal(): { registry: RefRegistry; jumps: SavedJump[] } {
    document.body.innerHTML = `
      <main>
        <section aria-label="Article">
          <h2>Introduction</h2>
          <h2>Methods</h2>
          <h2>Results</h2>
          <h2>Discussion</h2>
          <h2>References</h2>
        </section>
      </main>
    `;
    const { root, registry } = extractTree(document.body);
    const jumps = collectLeafRefs(root, (n) => n.role === 'heading');
    expect(jumps).toHaveLength(5);
    return { registry, jumps };
  }

  it('resolves all 5 jumps after a logically equivalent re-render', () => {
    const { registry, jumps } = setupOriginal();

    // Re-render: replace the section's HTML with the same headings. The
    // original Elements are destroyed; equivalents are created.
    document.querySelector('section')!.innerHTML = `
      <h2>Introduction</h2>
      <h2>Methods</h2>
      <h2>Results</h2>
      <h2>Discussion</h2>
      <h2>References</h2>
    `;

    const attempts = attemptAll(jumps, registry);

    // No silent wrong jumps.
    assertNoSilentWrongJumps(attempts);

    // At least 4 of 5 must resolve correctly OR fail safely.
    expect(countCorrectOrSafe(attempts)).toBeGreaterThanOrEqual(4);

    // Stronger expectation: all 5 should resolve correctly. Each heading
    // has a unique accessible name.
    expect(attempts.every((a) => a.semanticallyCorrect === true)).toBe(true);
  });

  it('does NOT report exact-match after a re-render (Elements are new)', () => {
    const { registry, jumps } = setupOriginal();
    document.querySelector('section')!.innerHTML = `
      <h2>Introduction</h2>
      <h2>Methods</h2>
      <h2>Results</h2>
      <h2>Discussion</h2>
      <h2>References</h2>
    `;
    for (const j of jumps) {
      const r = resolveRef(j.ref, registry);
      expect(r.method).not.toBe('exact');
    }
  });
});

describe('EC-1 scenario 2: virtualized list scroll', () => {
  it('resolves surviving items and fails safely on unmounted ones', () => {
    document.body.innerHTML = `
      <main>
        <ul aria-label="Results">
          <li><a href="/a">Apple</a></li>
          <li><a href="/b">Banana</a></li>
          <li><a href="/c">Cherry</a></li>
          <li><a href="/d">Date</a></li>
          <li><a href="/e">Elderberry</a></li>
        </ul>
      </main>
    `;
    const { root, registry } = extractTree(document.body);
    const jumps = collectLeafRefs(root, (n) => n.role === 'link');
    expect(jumps).toHaveLength(5);

    // Scroll: Apple unmounts, Fig appears; B–E remain semantically present
    // but as fresh DOM nodes.
    document.querySelector('ul')!.innerHTML = `
      <li><a href="/b">Banana</a></li>
      <li><a href="/c">Cherry</a></li>
      <li><a href="/d">Date</a></li>
      <li><a href="/e">Elderberry</a></li>
      <li><a href="/f">Fig</a></li>
    `;

    const attempts = attemptAll(jumps, registry);
    assertNoSilentWrongJumps(attempts);

    const appleAttempt = attempts.find((a) => a.jump.originalName === 'Apple')!;
    expect(
      appleAttempt.method === 'failed' ||
        appleAttempt.confidence < CONFIDENCE_JUMP_THRESHOLD
    ).toBe(true);

    // The 4 survivors should resolve correctly.
    const survivors = attempts.filter(
      (a) => a.jump.originalName !== 'Apple'
    );
    expect(survivors.every((a) => a.semanticallyCorrect === true)).toBe(true);

    // EC-1: at least 4 of 5 jumps resolve OR fail safely.
    expect(countCorrectOrSafe(attempts)).toBeGreaterThanOrEqual(4);
  });
});

describe('EC-1 scenario 3: hydration', () => {
  it('resolves through framework hydration that adds structural wrappers', () => {
    // Server-rendered HTML.
    document.body.innerHTML = `
      <main>
        <h1>Dashboard</h1>
        <nav aria-label="Sections">
          <a href="#a">Activity</a>
          <a href="#b">Billing</a>
          <a href="#c">Calendar</a>
          <a href="#d">Documents</a>
        </nav>
      </main>
    `;
    const { root, registry } = extractTree(document.body);
    const jumps = [
      ...collectLeafRefs(root, (n) => n.role === 'heading'),
      ...collectLeafRefs(root, (n) => n.role === 'link'),
    ];
    expect(jumps.length).toBe(5);

    // Client framework "hydrates" — same semantic content, different DOM
    // wrapping (extra divs, class names, the nav becomes a <section
    // role="navigation">).
    document.body.innerHTML = `
      <main class="app">
        <div class="header"><h1>Dashboard</h1></div>
        <section role="navigation" aria-label="Sections" class="sidebar">
          <div class="nav-list">
            <div class="nav-item"><a href="#a">Activity</a></div>
            <div class="nav-item"><a href="#b">Billing</a></div>
            <div class="nav-item"><a href="#c">Calendar</a></div>
            <div class="nav-item"><a href="#d">Documents</a></div>
          </div>
        </section>
      </main>
    `;

    const attempts = attemptAll(jumps, registry);
    assertNoSilentWrongJumps(attempts);

    // EC-1 acceptance.
    expect(countCorrectOrSafe(attempts)).toBeGreaterThanOrEqual(4);
    // Stronger: every original semantic target still exists, so every jump
    // should resolve correctly.
    expect(attempts.every((a) => a.semanticallyCorrect === true)).toBe(true);
  });
});

describe('EC-1 cross-cutting invariants', () => {
  it('a removed element resolves to failed, not to a similarly-named neighbor', () => {
    document.body.innerHTML = `
      <main>
        <button>Save</button>
        <button>Cancel</button>
      </main>
    `;
    const { root, registry } = extractTree(document.body);
    const cancelRef = root.children[0]!.children[1]!.ref;
    expect(root.children[0]!.children[1]!.name).toBe('Cancel');

    // Remove the Cancel button entirely. Save remains.
    document.querySelectorAll('button')[1]!.remove();

    const result = resolveRef(cancelRef, registry);
    // Either failed, or low-confidence — but never an exact/hint_match jump
    // to the Save button.
    if (result.method !== 'failed' && result.element !== null) {
      expect(computeName(result.element).name).not.toBe('Save');
    }
  });
});
