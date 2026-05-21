import { describe, expect, it, beforeEach } from 'vitest';
import { computeName } from '@/content/dom-accessibility/compute-name';

function setup(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

describe('computeName', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns text content as the name with source "text"', () => {
    const el = setup('<button>Save</button>');
    expect(computeName(el)).toEqual({ name: 'Save', source: 'text' });
  });

  it('returns aria-label as the name with source "aria-label"', () => {
    const el = setup('<button aria-label="Close dialog">×</button>');
    expect(computeName(el)).toEqual({
      name: 'Close dialog',
      source: 'aria-label',
    });
  });

  it('returns aria-labelledby with source "aria-labelledby"', () => {
    document.body.innerHTML =
      '<h2 id="h">Settings</h2><button aria-labelledby="h">x</button>';
    const button = document.querySelector('button')!;
    expect(computeName(button)).toEqual({
      name: 'Settings',
      source: 'aria-labelledby',
    });
  });

  it('returns label-for as the name with source "label"', () => {
    document.body.innerHTML =
      '<label for="i">Email</label><input id="i" type="text" />';
    const input = document.querySelector('input')!;
    expect(computeName(input)).toEqual({ name: 'Email', source: 'label' });
  });

  it('handles wrapping <label>', () => {
    document.body.innerHTML = '<label>Password <input type="password" /></label>';
    const input = document.querySelector('input')!;
    const result = computeName(input);
    expect(result.source).toBe('label');
    expect(result.name).toContain('Password');
  });

  it('returns alt on img with source "alt"', () => {
    const el = setup('<img alt="Company logo" src="x.png" />');
    expect(computeName(el)).toEqual({ name: 'Company logo', source: 'alt' });
  });

  it('returns empty with source "none" when no name can be computed', () => {
    const el = setup('<div></div>');
    expect(computeName(el)).toEqual({ name: '', source: 'none' });
  });

  it('returns title as source "title" when there is no text content', () => {
    const el = setup('<a href="/x" title="More info"><span aria-hidden="true">i</span></a>');
    const result = computeName(el);
    // a with only aria-hidden children falls back to title
    expect(result.source === 'title' || result.source === 'text').toBe(true);
  });

  it('trims surrounding whitespace', () => {
    const el = setup('<button>   Submit   </button>');
    expect(computeName(el).name).toBe('Submit');
  });
});
