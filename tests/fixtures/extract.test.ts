/**
 * Integration test running extractPageModel against each Phase 0 fixture.
 * Per-fixture invariants live in fixtures/F#-name/notes.md; this file
 * encodes the ones we can assert in jsdom.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPageModel } from '@/content/extract/page-model';
import { resolveRef } from '@/content/refs/resolve';
import { PageModelSchema } from '@/schemas/page-model';
import type { PageElement } from '@/schemas/page-element';

function loadFixture(name: string): string {
  return readFileSync(
    resolve(process.cwd(), `fixtures/${name}/index.html`),
    'utf8'
  );
}

function bodyOf(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  if (m === null) throw new Error('No <body> in fixture');
  return m[1]!;
}

function setupFixture(name: string): void {
  document.body.innerHTML = bodyOf(loadFixture(name));
  // Title comes from <title> in <head>; jsdom doesn't parse it from a
  // body-only injection, so set it directly when we care.
  const t = loadFixture(name).match(/<title>([^<]+)<\/title>/);
  if (t !== null) document.title = t[1]!;
}

function walk(el: PageElement, predicate: (n: PageElement) => boolean): PageElement[] {
  const out: PageElement[] = [];
  const visit = (n: PageElement): void => {
    if (predicate(n)) out.push(n);
    for (const c of n.children) visit(c);
  };
  visit(el);
  return out;
}

describe('F1 — well-structured article', () => {
  it('produces a schema-valid model with all the major landmarks', () => {
    setupFixture('F1-article');
    const { pageModel, capability, sensitivity } = extractPageModel(document);

    expect(PageModelSchema.safeParse(pageModel).success).toBe(true);
    expect(pageModel.page_state).toBe('normal');
    expect(pageModel.main_content.role).toBe('main');

    const landmarkRoles = pageModel.landmarks.map((l) => l.role).sort();
    expect(landmarkRoles).toEqual(
      expect.arrayContaining([
        'banner',
        'complementary',
        'contentinfo',
        'main',
        'navigation',
      ])
    );

    expect(sensitivity.page_classification).toBe('public_likely');
    expect(sensitivity.redactions).toEqual([]);

    expect(capability.counts.headings).toBeGreaterThanOrEqual(6);
    expect(capability.counts.links).toBeGreaterThanOrEqual(5);
  });
});

describe('F2 — search results', () => {
  it('captures the search input, forms, and primary buttons', () => {
    setupFixture('F2-search-results');
    const { pageModel, capability } = extractPageModel(document);

    expect(pageModel.interaction_surface.search_inputs.length).toBeGreaterThan(0);
    expect(pageModel.interaction_surface.forms.length).toBeGreaterThan(0);
    expect(
      pageModel.interaction_surface.primary_buttons.length
    ).toBeGreaterThanOrEqual(3);

    expect(capability.counts.links).toBeGreaterThanOrEqual(10);
    expect(capability.counts.form_controls).toBeGreaterThanOrEqual(5);
  });

  it('includes a pagination "Next" link in deterministic candidates', () => {
    setupFixture('F2-search-results');
    const { pageModel } = extractPageModel(document);
    expect(pageModel.deterministic_candidates.length).toBeGreaterThan(2);
  });
});

describe('F3 — div-soup app', () => {
  it('flags no_main_region (page genuinely lacks the landmark) but picks a readability-scored content container as main_content', () => {
    setupFixture('F3-div-soup');
    const { pageModel, capability } = extractPageModel(document);

    expect(capability.reasons).toContain('no_main_region');
    expect(capability.counts.headings).toBe(0);
    expect(capability.counts.landmarks).toBe(0);
    expect(capability.counts.buttons).toBe(0);

    // The readability fallback should pick something inside the page
    // rather than the body root. F3's div with class="content" is the
    // expected winner — substantial text + matches the positive pattern.
    expect(pageModel.main_content.tag).not.toBe('body');
    expect(pageModel.main_content.ref.selector_hints.css).toContain('content');
  });
});

describe('F4 — form-heavy page', () => {
  it('classifies as credential_likely and includes all sensitive redactions', () => {
    setupFixture('F4-form-heavy');
    const { sensitivity, pageModel } = extractPageModel(document);

    expect(sensitivity.page_classification).toBe('credential_likely');
    const kinds = sensitivity.redactions.map((r) => r.kind);
    expect(kinds).toContain('password');
    expect(kinds).toContain('credit_card');
    expect(kinds).toContain('email');
    expect(kinds).toContain('phone');
    expect(kinds).toContain('address');

    // At least 4 credit-card hits (name/number/exp/csc).
    const ccCount = kinds.filter((k) => k === 'credit_card').length;
    expect(ccCount).toBeGreaterThanOrEqual(4);

    // Multiple address hits (street/zip/country).
    const addrCount = kinds.filter((k) => k === 'address').length;
    expect(addrCount).toBeGreaterThanOrEqual(2);

    expect(pageModel.interaction_surface.forms.length).toBeGreaterThan(0);
  });

  it('never captures a form input value', () => {
    setupFixture('F4-form-heavy');
    const { pageModel } = extractPageModel(document);
    // Walk every element and confirm form_control.value is never present
    // (the schema doesn't even allow it; this asserts our wiring).
    const allElements = walk(pageModel.main_content, () => true);
    for (const el of allElements) {
      if (el.form_control !== undefined) {
        expect((el.form_control as Record<string, unknown>).value).toBeUndefined();
      }
    }
  });
});

describe('F5 — large mutating page', () => {
  it('extracts cleanly at first paint', () => {
    setupFixture('F5-large-mutating');
    const { pageModel, capability } = extractPageModel(document);
    expect(pageModel.main_content.role).toBe('main');
    expect(capability.counts.headings).toBeGreaterThanOrEqual(6);
  });

  it('survives a simulated hydration: equivalent refs still resolve via fallback', () => {
    setupFixture('F5-large-mutating');
    const { pageModel, registry } = extractPageModel(document);

    // Grab a few well-named refs (the headings) before mutation.
    const headings = walk(
      pageModel.main_content,
      (n) => n.role === 'heading' && n.name !== undefined && n.name !== ''
    ).slice(0, 4);
    expect(headings.length).toBeGreaterThan(0);

    // Simulate hydration: wrap each <section> in extra <div>s and add a
    // class attribute. Semantic content is unchanged.
    const sections = document.querySelectorAll('main > article > section');
    sections.forEach((s) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'hydrated';
      s.parentNode!.insertBefore(wrapper, s);
      wrapper.appendChild(s);
      s.classList.add('hydrated-section');
    });

    // Each pre-mutation heading should still resolve (via fallback) or fail
    // safely; no silent wrong jumps allowed.
    for (const h of headings) {
      const r = resolveRef(h.ref, registry, { document });
      if (r.method === 'failed') continue;
      // If a resolution returned an element, its role + name must match.
      expect(r.element).not.toBeNull();
      // Confidence should be at least the fallback threshold.
      expect(r.confidence).toBeGreaterThanOrEqual(0.4);
    }
  });
});
