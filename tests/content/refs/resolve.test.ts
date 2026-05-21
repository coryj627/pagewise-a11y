import { describe, expect, it, beforeEach } from 'vitest';
import { extractTree } from '@/content/extract/walker';
import { resolveRef } from '@/content/refs/resolve';
import type { NodeRef } from '@/schemas/node-ref';

describe('resolveRef — step 1 (exact, live registry)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns exact match when the element is still live', () => {
    document.body.innerHTML = '<main><h1>Title</h1></main>';
    const { root, registry } = extractTree(document.body);
    const h1Ref = root.children[0]!.children[0]!.ref;

    const result = resolveRef(h1Ref, registry);
    expect(result.method).toBe('exact');
    expect(result.confidence).toBe(1);
    expect(result.element).toBe(document.querySelector('h1'));
  });

  it('does NOT exact-match when extraction_id mismatches', () => {
    document.body.innerHTML = '<main><h1>Title</h1></main>';
    const { root, registry } = extractTree(document.body);
    const h1Ref: NodeRef = {
      ...root.children[0]!.children[0]!.ref,
      extraction_id: '99999999-9999-4999-8999-999999999999',
    };

    const result = resolveRef(h1Ref, registry);
    // It can still resolve via hint_match because the element is in the DOM,
    // but it must NOT report 'exact'.
    expect(result.method).not.toBe('exact');
  });

  it('does NOT exact-match when the element has been detached', () => {
    document.body.innerHTML = '<main><h1>Title</h1></main>';
    const { root, registry } = extractTree(document.body);
    const h1Ref = root.children[0]!.children[0]!.ref;
    document.querySelector('h1')!.remove();

    const result = resolveRef(h1Ref, registry);
    expect(result.method).not.toBe('exact');
  });
});

describe('resolveRef — step 2 (hint match, verified)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('matches via xpath after the equivalent element is re-rendered', () => {
    document.body.innerHTML = '<main><h2>Section A</h2></main>';
    const { root, registry } = extractTree(document.body);
    const h2Ref = root.children[0]!.children[0]!.ref;

    // Simulate a re-render: remove and recreate the same heading.
    document.querySelector('main')!.innerHTML = '<h2>Section A</h2>';

    const result = resolveRef(h2Ref, registry);
    expect(result.method).toBe('hint_match');
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.element?.textContent).toBe('Section A');
  });

  it('rejects a hint match when the candidate role differs', () => {
    document.body.innerHTML = '<main><h2>X</h2></main>';
    const { root, registry } = extractTree(document.body);
    const h2Ref = root.children[0]!.children[0]!.ref;

    // Replace heading with a paragraph at the same path. The xpath will hit
    // the paragraph but the role hash won't match.
    document.querySelector('main')!.innerHTML = '<p>X</p>';

    const result = resolveRef(h2Ref, registry);
    expect(result.method).not.toBe('hint_match');
    expect(result.method).toBe('failed');
  });

  it('returns confidence 0.6 when multiple verified candidates match', () => {
    document.body.innerHTML = '<main><button>Save</button></main>';
    const { root, registry } = extractTree(document.body);
    const btnRef = root.children[0]!.children[0]!.ref;

    // Add an identical button — both will pass the hash verification when
    // the xpath/CSS hint widens.
    document.querySelector('main')!.innerHTML =
      '<button>Save</button><button>Save</button>';

    const result = resolveRef(btnRef, registry);
    // Either hint_match (low conf) or fallback (low conf) is acceptable
    // here; the important assertion is the low confidence.
    expect(result.confidence).toBeLessThan(0.8);
    expect(result.element).not.toBeNull();
  });
});

describe('resolveRef — step 3 (fallback)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds the equivalent element after structural changes invalidate hints', () => {
    document.body.innerHTML = '<main><h2>Quarterly results</h2></main>';
    const { root, registry } = extractTree(document.body);
    const h2Ref = root.children[0]!.children[0]!.ref;

    // Wrap the heading in a new container — xpath/CSS hints break, but the
    // role + name fallback should still find it.
    document.body.innerHTML =
      '<main><section><div><h2>Quarterly results</h2></div></section></main>';

    const result = resolveRef(h2Ref, registry);
    expect(result.method).toBe('fallback');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.element?.textContent).toBe('Quarterly results');
  });

  it('returns failed when nothing matches the role + name', () => {
    document.body.innerHTML = '<main><h2>Unique title</h2></main>';
    const { root, registry } = extractTree(document.body);
    const h2Ref = root.children[0]!.children[0]!.ref;

    // Replace with a completely different heading.
    document.body.innerHTML = '<main><h2>Totally different</h2></main>';

    const result = resolveRef(h2Ref, registry);
    expect(result.method).toBe('failed');
    expect(result.element).toBeNull();
    expect(result.confidence).toBe(0);
  });
});
