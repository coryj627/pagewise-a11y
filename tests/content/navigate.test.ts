import { describe, expect, it, beforeEach } from 'vitest';
import { jumpToRef } from '@/content/navigate';
import { extractTree } from '@/content/extract/walker';

describe('jumpToRef', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('jumps to a natively focusable element exactly', () => {
    document.body.innerHTML = '<main><button id="b">Save</button></main>';
    const { root, registry } = extractTree(document.body);
    const btnRef = root.children[0]!.children[0]!.ref;

    const result = jumpToRef(btnRef, registry);
    expect(result.kind).toBe('jumped');
    if (result.kind === 'jumped') {
      expect(result.method).toBe('exact');
      expect(result.element.role).toBe('button');
      expect(result.element.name).toBe('Save');
    }
    expect(document.activeElement).toBe(document.getElementById('b'));
  });

  it('applies temporary tabindex to non-focusable elements', () => {
    document.body.innerHTML = '<main><h2>Section</h2></main>';
    const { root, registry } = extractTree(document.body);
    const h2Ref = root.children[0]!.children[0]!.ref;

    const result = jumpToRef(h2Ref, registry);
    expect(result.kind).toBe('jumped');
    const h2 = document.querySelector('h2')!;
    expect(document.activeElement).toBe(h2);
    expect(h2.getAttribute('tabindex')).toBe('-1');
  });

  it('restores the original tabindex on blur', () => {
    document.body.innerHTML = '<main><h2>Section</h2></main>';
    const { root, registry } = extractTree(document.body);
    const h2Ref = root.children[0]!.children[0]!.ref;
    const h2 = document.querySelector('h2')!;
    expect(h2.hasAttribute('tabindex')).toBe(false);

    jumpToRef(h2Ref, registry);
    expect(h2.getAttribute('tabindex')).toBe('-1');

    h2.dispatchEvent(new FocusEvent('blur'));
    expect(h2.hasAttribute('tabindex')).toBe(false);
  });

  it('preserves a pre-existing tabindex across the jump', () => {
    document.body.innerHTML = '<main><div tabindex="2" id="d">x</div></main>';
    const { root, registry } = extractTree(document.body);
    const divRef = root.children[0]!.children[0]!.ref;
    const div = document.getElementById('d')!;
    expect(div.getAttribute('tabindex')).toBe('2');

    jumpToRef(divRef, registry);
    // tabindex="2" already qualifies as programmatically focusable, so
    // navigate.ts should NOT replace it.
    expect(div.getAttribute('tabindex')).toBe('2');
  });

  it('returns failed when the ref cannot be resolved', () => {
    document.body.innerHTML = '<main><h2>X</h2></main>';
    const { root, registry } = extractTree(document.body);
    const h2Ref = root.children[0]!.children[0]!.ref;

    // Replace the entire DOM so the ref no longer matches anything.
    document.body.innerHTML = '<main><p>completely different</p></main>';

    const result = jumpToRef(h2Ref, registry);
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.reason).toBe('not_resolved');
    }
  });

  it('returns failed when confidence is below the threshold', () => {
    document.body.innerHTML = '<main><button>Save</button></main>';
    const { root, registry } = extractTree(document.body);
    const ref = root.children[0]!.children[0]!.ref;

    const result = jumpToRef(ref, registry, { confidenceThreshold: 1.1 });
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.reason).toBe('low_confidence');
    }
  });
});
