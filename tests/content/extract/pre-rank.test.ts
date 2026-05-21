import { describe, expect, it } from 'vitest';
import { pickDeterministicCandidates } from '@/content/extract/pre-rank';
import type { PageElement } from '@/schemas/page-element';
import type { NodeRef } from '@/schemas/node-ref';

const EXTRACTION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function ref(id: string, role: string): NodeRef {
  return {
    id,
    extraction_id: EXTRACTION,
    frame_ref: 'top',
    selector_hints: {},
    hashes: { role },
  };
}

function el(
  id: string,
  role: string,
  overrides: Partial<PageElement> = {}
): PageElement {
  return {
    ref: ref(id, role),
    tag: 'div',
    role,
    role_source: 'inferred',
    children: [],
    ...overrides,
  };
}

function flatten(...nodes: PageElement[]): PageElement[] {
  const out: PageElement[] = [];
  const visit = (n: PageElement): void => {
    out.push(n);
    for (const c of n.children) visit(c);
  };
  for (const n of nodes) visit(n);
  return out;
}

describe('pickDeterministicCandidates', () => {
  it('puts main first when it is not the root', () => {
    const main = el('n_main', 'main');
    const root = el('n_body', 'generic', { children: [main] });
    const result = pickDeterministicCandidates({
      root,
      main,
      all: flatten(root),
      landmarks: [main],
      forms: [],
      primaryButtons: [],
      searchInputs: [],
    });
    expect(result[0]?.id).toBe('n_main');
  });

  it('skips main when it equals the root', () => {
    const body = el('n_body', 'generic');
    const result = pickDeterministicCandidates({
      root: body,
      main: body, // no real main element
      all: [body],
      landmarks: [],
      forms: [],
      primaryButtons: [],
      searchInputs: [],
    });
    expect(result.find((r) => r.id === 'n_body')).toBeUndefined();
  });

  it('prefers H1 over other headings', () => {
    const h2 = el('n_h2', 'heading', { level: 2 });
    const h1 = el('n_h1', 'heading', { level: 1 });
    const main = el('n_main', 'main', { children: [h2, h1] });
    const root = el('n_body', 'generic', { children: [main] });
    const result = pickDeterministicCandidates({
      root,
      main,
      all: flatten(root),
      landmarks: [main],
      forms: [],
      primaryButtons: [],
      searchInputs: [],
    });
    // After main, the first heading should be H1.
    expect(result[0]?.id).toBe('n_main');
    expect(result[1]?.id).toBe('n_h1');
  });

  it('falls back to the first heading when no H1 exists', () => {
    const h2 = el('n_h2', 'heading', { level: 2 });
    const main = el('n_main', 'main', { children: [h2] });
    const root = el('n_body', 'generic', { children: [main] });
    const result = pickDeterministicCandidates({
      root,
      main,
      all: flatten(root),
      landmarks: [main],
      forms: [],
      primaryButtons: [],
      searchInputs: [],
    });
    expect(result[1]?.id).toBe('n_h2');
  });

  it('inserts a search input before alerts and forms', () => {
    const search = el('n_search', 'searchbox');
    const alert = el('n_alert', 'alert');
    const form = el('n_form', 'form');
    const main = el('n_main', 'main', { children: [alert, search, form] });
    const root = el('n_body', 'generic', { children: [main] });
    const result = pickDeterministicCandidates({
      root,
      main,
      all: flatten(root),
      landmarks: [main],
      forms: [form],
      primaryButtons: [],
      searchInputs: [search],
    });
    const ids = result.map((r) => r.id);
    expect(ids.indexOf('n_search')).toBeLessThan(ids.indexOf('n_alert'));
    expect(ids.indexOf('n_alert')).toBeLessThan(ids.indexOf('n_form'));
  });

  it('captures pagination links by name pattern', () => {
    const next = el('n_next', 'link', { name: 'Next' });
    const page3 = el('n_p3', 'link', { name: 'page 3' });
    const ordinary = el('n_o', 'link', { name: 'About us' });
    const main = el('n_main', 'main', { children: [next, page3, ordinary] });
    const root = el('n_body', 'generic', { children: [main] });
    const result = pickDeterministicCandidates({
      root,
      main,
      all: flatten(root),
      landmarks: [main],
      forms: [],
      primaryButtons: [],
      searchInputs: [],
    });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('n_next');
    expect(ids).toContain('n_p3');
    expect(ids).not.toContain('n_o');
  });

  it('captures dialogs', () => {
    const dialog = el('n_d', 'dialog', { name: 'Cookie consent' });
    const main = el('n_main', 'main', { children: [dialog] });
    const root = el('n_body', 'generic', { children: [main] });
    const result = pickDeterministicCandidates({
      root,
      main,
      all: flatten(root),
      landmarks: [main],
      forms: [],
      primaryButtons: [],
      searchInputs: [],
    });
    expect(result.map((r) => r.id)).toContain('n_d');
  });

  it('captures tables', () => {
    const table = el('n_t', 'table');
    const main = el('n_main', 'main', { children: [table] });
    const root = el('n_body', 'generic', { children: [main] });
    const result = pickDeterministicCandidates({
      root,
      main,
      all: flatten(root),
      landmarks: [main],
      forms: [],
      primaryButtons: [],
      searchInputs: [],
    });
    expect(result.map((r) => r.id)).toContain('n_t');
  });

  it('deduplicates by ref.id when an element appears via multiple paths', () => {
    const nav = el('n_nav', 'navigation');
    const main = el('n_main', 'main');
    const root = el('n_body', 'generic', { children: [nav, main] });
    const result = pickDeterministicCandidates({
      root,
      main,
      all: flatten(root),
      landmarks: [nav, main],
      forms: [],
      primaryButtons: [],
      searchInputs: [],
    });
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
