import { describe, expect, it } from 'vitest';
import { hashPageElementTree } from '@/shared/content-hash';
import type { PageElement } from '@/schemas/page-element';
import type { NodeRef } from '@/schemas/node-ref';

const EXTRACTION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXTRACTION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function ref(id: string, extractionId: string): NodeRef {
  return {
    id,
    extraction_id: extractionId,
    frame_ref: 'top',
    selector_hints: {},
    hashes: { role: 'generic' },
  };
}

function leaf(extractionId: string, refId: string, text: string): PageElement {
  return {
    ref: ref(refId, extractionId),
    tag: 'p',
    role: 'paragraph',
    role_source: 'native',
    text,
    children: [],
  };
}

describe('hashPageElementTree', () => {
  it('is stable across runs of the same input', () => {
    const a = leaf(EXTRACTION_A, 'n_00001', 'hi');
    expect(hashPageElementTree(a)).toBe(hashPageElementTree(a));
  });

  it('ignores extraction_id and NodeRef ids', () => {
    const a = leaf(EXTRACTION_A, 'n_00001', 'hi');
    const b = leaf(EXTRACTION_B, 'n_99999', 'hi');
    expect(hashPageElementTree(a)).toBe(hashPageElementTree(b));
  });

  it('changes when text content changes', () => {
    expect(hashPageElementTree(leaf(EXTRACTION_A, 'n_1', 'one'))).not.toBe(
      hashPageElementTree(leaf(EXTRACTION_A, 'n_1', 'two'))
    );
  });

  it('changes when role changes', () => {
    const base = leaf(EXTRACTION_A, 'n_1', 'x');
    const altered: PageElement = { ...base, role: 'button' };
    expect(hashPageElementTree(base)).not.toBe(hashPageElementTree(altered));
  });

  it('changes when structure changes', () => {
    const parent: PageElement = {
      ref: ref('n_p', EXTRACTION_A),
      tag: 'main',
      role: 'main',
      role_source: 'native',
      children: [leaf(EXTRACTION_A, 'n_c', 'kid')],
    };
    const empty: PageElement = { ...parent, children: [] };
    expect(hashPageElementTree(parent)).not.toBe(hashPageElementTree(empty));
  });
});
