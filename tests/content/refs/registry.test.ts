import { describe, expect, it, beforeEach } from 'vitest';
import { RefRegistry } from '@/content/refs/registry';

describe('RefRegistry', () => {
  let registry: RefRegistry;
  let buttonEl: HTMLButtonElement;
  let spanEl: HTMLSpanElement;

  beforeEach(() => {
    registry = new RefRegistry('11111111-1111-4111-8111-111111111111');
    document.body.innerHTML = '<button id="b">Hello</button><span id="s">World</span>';
    buttonEl = document.getElementById('b') as HTMLButtonElement;
    spanEl = document.getElementById('s') as HTMLSpanElement;
  });

  it('stores and retrieves elements by id', () => {
    registry.set('n_00001', buttonEl);
    expect(registry.get('n_00001')).toBe(buttonEl);
    expect(registry.has('n_00001')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('returns undefined for unknown ids', () => {
    expect(registry.get('n_99999')).toBeUndefined();
    expect(registry.has('n_99999')).toBe(false);
  });

  it('overwrites on duplicate set', () => {
    registry.set('n_00001', buttonEl);
    registry.set('n_00001', spanEl);
    expect(registry.get('n_00001')).toBe(spanEl);
    expect(registry.size).toBe(1);
  });

  it('deletes entries', () => {
    registry.set('n_00001', buttonEl);
    expect(registry.delete('n_00001')).toBe(true);
    expect(registry.has('n_00001')).toBe(false);
    expect(registry.delete('n_00001')).toBe(false);
  });

  it('clears all entries', () => {
    registry.set('n_00001', buttonEl);
    registry.set('n_00002', spanEl);
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('exposes extraction_id', () => {
    expect(registry.extractionId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('iterates entries', () => {
    registry.set('n_00001', buttonEl);
    registry.set('n_00002', spanEl);
    const entries = Array.from(registry.entries());
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual(['n_00001', buttonEl]);
  });

  it('keeps element reference even after detachment from DOM', () => {
    // The registry doesn't check liveness — that's resolve.ts's job. After
    // detachment, get() still returns the (now-orphaned) element.
    registry.set('n_00001', buttonEl);
    buttonEl.remove();
    expect(registry.get('n_00001')).toBe(buttonEl);
    expect(document.contains(buttonEl)).toBe(false);
  });
});
