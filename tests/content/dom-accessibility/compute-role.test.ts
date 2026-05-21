import { describe, expect, it } from 'vitest';
import { computeRole } from '@/content/dom-accessibility/compute-role';

function only(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

describe('computeRole — explicit role attribute', () => {
  it('uses explicit role with source "aria"', () => {
    expect(computeRole(only('<div role="button">x</div>'))).toEqual({
      role: 'button',
      source: 'aria',
    });
  });

  it('lowercases and trims explicit role', () => {
    expect(computeRole(only('<div role="  Banner  ">x</div>'))).toEqual({
      role: 'banner',
      source: 'aria',
    });
  });

  it('explicit role wins over native role', () => {
    expect(computeRole(only('<button role="link">x</button>'))).toEqual({
      role: 'link',
      source: 'aria',
    });
  });
});

describe('computeRole — native element mapping', () => {
  it.each<[string, string]>([
    ['<button>x</button>', 'button'],
    ['<a href="/x">x</a>', 'link'],
    ['<a>x</a>', 'generic'],
    ['<main>x</main>', 'main'],
    ['<nav>x</nav>', 'navigation'],
    ['<aside>x</aside>', 'complementary'],
    ['<article>x</article>', 'article'],
    ['<h1>x</h1>', 'heading'],
    ['<h6>x</h6>', 'heading'],
    ['<p>x</p>', 'paragraph'],
    ['<ul></ul>', 'list'],
    ['<ol></ol>', 'list'],
    ['<li>x</li>', 'listitem'],
    ['<form></form>', 'form'],
    ['<dialog></dialog>', 'dialog'],
    ['<fieldset></fieldset>', 'group'],
    ['<table></table>', 'table'],
    ['<textarea></textarea>', 'textbox'],
    ['<select></select>', 'combobox'],
    ['<progress></progress>', 'progressbar'],
    ['<output></output>', 'status'],
    ['<search></search>', 'search'],
    ['<summary></summary>', 'button'],
    ['<hr />', 'separator'],
    ['<figure></figure>', 'figure'],
  ])('infers role from %s', (html, role) => {
    expect(computeRole(only(html))).toEqual({ role, source: 'native' });
  });

  it('infers role for <tr> and <td> inside a table', () => {
    document.body.innerHTML = '<table><tr><td>x</td></tr></table>';
    const tr = document.querySelector('tr')!;
    const td = document.querySelector('td')!;
    expect(computeRole(tr)).toEqual({ role: 'row', source: 'native' });
    expect(computeRole(td)).toEqual({ role: 'cell', source: 'native' });
  });

  it('returns "img" for img with alt', () => {
    expect(computeRole(only('<img alt="x" />'))).toEqual({
      role: 'img',
      source: 'native',
    });
  });

  it('returns "presentation" for img with alt=""', () => {
    expect(computeRole(only('<img alt="" />'))).toEqual({
      role: 'presentation',
      source: 'native',
    });
  });

  it('maps input types', () => {
    expect(computeRole(only('<input type="checkbox" />')).role).toBe('checkbox');
    expect(computeRole(only('<input type="radio" />')).role).toBe('radio');
    expect(computeRole(only('<input type="range" />')).role).toBe('slider');
    expect(computeRole(only('<input type="number" />')).role).toBe('spinbutton');
    expect(computeRole(only('<input type="search" />')).role).toBe('searchbox');
    expect(computeRole(only('<input type="submit" />')).role).toBe('button');
    expect(computeRole(only('<input type="text" />')).role).toBe('textbox');
    expect(computeRole(only('<input />')).role).toBe('textbox');
  });

  it('select with multiple becomes listbox', () => {
    expect(computeRole(only('<select multiple></select>')).role).toBe('listbox');
  });

  it('select with size > 1 becomes listbox', () => {
    expect(computeRole(only('<select size="3"></select>')).role).toBe('listbox');
  });

  it('section needs an accessible naming attribute to become region', () => {
    expect(computeRole(only('<section></section>')).role).toBe('generic');
    expect(computeRole(only('<section aria-label="x"></section>')).role).toBe('region');
  });

  it('header inside an article becomes generic', () => {
    document.body.innerHTML = '<article><header>x</header></article>';
    const header = document.querySelector('header')!;
    expect(computeRole(header).role).toBe('generic');
  });

  it('top-level header becomes banner', () => {
    document.body.innerHTML = '<header>x</header>';
    expect(computeRole(document.querySelector('header')!).role).toBe('banner');
  });

  it('footer inside an article becomes generic', () => {
    document.body.innerHTML = '<article><footer>x</footer></article>';
    expect(computeRole(document.querySelector('footer')!).role).toBe('generic');
  });

  it('top-level footer becomes contentinfo', () => {
    document.body.innerHTML = '<footer>x</footer>';
    expect(computeRole(document.querySelector('footer')!).role).toBe('contentinfo');
  });

  it('falls back to generic / inferred for unknown elements', () => {
    expect(computeRole(only('<custom-element></custom-element>'))).toEqual({
      role: 'generic',
      source: 'inferred',
    });
  });

  it('th in the first row defaults to columnheader', () => {
    document.body.innerHTML =
      '<table><tbody><tr><th>X</th></tr><tr><td>Y</td></tr></tbody></table>';
    const th = document.querySelector('th')!;
    expect(computeRole(th).role).toBe('columnheader');
  });

  it('th with scope="row" becomes rowheader', () => {
    document.body.innerHTML = '<table><tr><th scope="row">X</th></tr></table>';
    const th = document.querySelector('th')!;
    expect(computeRole(th).role).toBe('rowheader');
  });
});
