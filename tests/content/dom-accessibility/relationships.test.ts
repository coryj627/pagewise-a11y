import { describe, expect, it, beforeEach } from 'vitest';
import {
  collectAriaRelationships,
  nearestLandmarkAncestor,
} from '@/content/dom-accessibility/relationships';

function only(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('collectAriaRelationships', () => {
  it('returns an empty object when no aria-* relationships are present', () => {
    expect(collectAriaRelationships(only('<div>x</div>'))).toEqual({});
  });

  it('parses aria-labelledby into a labelled_by list', () => {
    expect(
      collectAriaRelationships(
        only('<button aria-labelledby="a b">x</button>')
      )
    ).toEqual({ labelled_by: ['a', 'b'] });
  });

  it('parses aria-describedby, aria-controls, and aria-owns', () => {
    expect(
      collectAriaRelationships(
        only(
          '<div aria-describedby="d1" aria-controls="c1 c2" aria-owns="o1"></div>'
        )
      )
    ).toEqual({
      described_by: ['d1'],
      controls: ['c1', 'c2'],
      owns: ['o1'],
    });
  });

  it('deduplicates repeated ids', () => {
    expect(
      collectAriaRelationships(only('<div aria-labelledby="a a b a"></div>'))
    ).toEqual({ labelled_by: ['a', 'b'] });
  });

  it('handles extra whitespace between tokens', () => {
    expect(
      collectAriaRelationships(only('<div aria-controls="  a    b\tc "></div>'))
    ).toEqual({ controls: ['a', 'b', 'c'] });
  });

  it('omits the field when the attribute is empty', () => {
    expect(
      collectAriaRelationships(only('<div aria-labelledby=""></div>'))
    ).toEqual({});
  });
});

describe('nearestLandmarkAncestor', () => {
  it('returns null when the element is not inside any landmark', () => {
    document.body.innerHTML = '<div><p>x</p></div>';
    const p = document.querySelector('p')!;
    expect(nearestLandmarkAncestor(p)).toBeNull();
  });

  it('returns the nearest <main>', () => {
    document.body.innerHTML = '<main><section><p>x</p></section></main>';
    const p = document.querySelector('p')!;
    expect(nearestLandmarkAncestor(p)?.tagName.toLowerCase()).toBe('main');
  });

  it('returns the nearest <nav>', () => {
    document.body.innerHTML = '<nav><ul><li>x</li></ul></nav>';
    const li = document.querySelector('li')!;
    expect(nearestLandmarkAncestor(li)?.tagName.toLowerCase()).toBe('nav');
  });

  it('handles explicit role on a div', () => {
    document.body.innerHTML =
      '<div role="navigation" id="n"><p>x</p></div>';
    expect(nearestLandmarkAncestor(document.querySelector('p')!)?.id).toBe('n');
  });

  it('walks past non-landmark ancestors', () => {
    document.body.innerHTML =
      '<main><div><section aria-label="x"><p>here</p></section></div></main>';
    // The section with aria-label gets role=region per compute-role.ts,
    // so it's the nearest landmark — beating <main>.
    const p = document.querySelector('p')!;
    expect(nearestLandmarkAncestor(p)?.tagName.toLowerCase()).toBe('section');
  });

  it('returns the outer <main> when the inner section is not a region', () => {
    document.body.innerHTML = '<main><section><p>x</p></section></main>';
    // section without naming → role generic, not region. Climb to main.
    const p = document.querySelector('p')!;
    expect(nearestLandmarkAncestor(p)?.tagName.toLowerCase()).toBe('main');
  });
});
