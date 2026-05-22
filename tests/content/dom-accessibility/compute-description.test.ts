import { describe, expect, it, beforeEach } from 'vitest';
import { computeDescription } from '@/content/dom-accessibility/compute-description';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('computeDescription', () => {
  it('returns "" when there is no description', () => {
    document.body.innerHTML = '<button>Click</button>';
    expect(computeDescription(document.querySelector('button')!)).toBe('');
  });

  it('resolves aria-describedby to the referenced element text', () => {
    document.body.innerHTML = `
      <button aria-describedby="hint">Submit</button>
      <p id="hint">Will email you a confirmation</p>
    `;
    expect(computeDescription(document.querySelector('button')!)).toBe(
      'Will email you a confirmation'
    );
  });

  it('joins multiple aria-describedby ids in order', () => {
    document.body.innerHTML = `
      <input type="text" aria-describedby="hint1 hint2" />
      <p id="hint1">Required.</p>
      <p id="hint2">Letters only.</p>
    `;
    const desc = computeDescription(document.querySelector('input')!);
    expect(desc).toContain('Required');
    expect(desc).toContain('Letters only');
  });

  it('collapses runs of whitespace in the resolved text', () => {
    document.body.innerHTML = `
      <button aria-describedby="hint">x</button>
      <p id="hint">  lots\n\nof   spaces  </p>
    `;
    expect(computeDescription(document.querySelector('button')!)).toBe(
      'lots of spaces'
    );
  });

  it('ignores nonexistent aria-describedby targets', () => {
    document.body.innerHTML =
      '<button aria-describedby="missing">x</button>';
    expect(computeDescription(document.querySelector('button')!)).toBe('');
  });
});
