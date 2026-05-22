import { describe, expect, it, beforeEach } from 'vitest';
import { pickReadabilityMain } from '@/content/extract/readability';
import { extractTree } from '@/content/extract/walker';

function setupFromHtml(html: string): ReturnType<typeof extractTree> {
  document.body.innerHTML = html;
  return extractTree(document.body);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('pickReadabilityMain', () => {
  it('returns null when no candidate has enough text', () => {
    const { root } = setupFromHtml('<div><p>tiny</p></div>');
    expect(pickReadabilityMain(root)).toBeNull();
  });

  it('picks a content-id container over chrome (div-soup case)', () => {
    const { root } = setupFromHtml(`
      <div class="topbar">
        <a href="/">Acme</a>
        <a href="/about">About</a>
        <a href="/help">Help</a>
      </div>
      <div id="content">
        <p>${'A real article. '.repeat(40)}</p>
        <p>${'Substantial content here. '.repeat(40)}</p>
        <p>${'More body paragraphs follow. '.repeat(40)}</p>
      </div>
      <div class="sidebar">
        <a href="/links">links</a>
        <a href="/feed">feed</a>
      </div>
    `);
    const winner = pickReadabilityMain(root);
    expect(winner).not.toBeNull();
    expect(winner?.ref.selector_hints.css).toContain('#content');
  });

  it('prefers a class-content container over a generic div with similar text', () => {
    const { root } = setupFromHtml(`
      <div>
        <p>${'Generic text. '.repeat(40)}</p>
      </div>
      <div class="article-content">
        <p>${'Generic text. '.repeat(40)}</p>
      </div>
    `);
    const winner = pickReadabilityMain(root);
    expect(winner?.ref.selector_hints.css).toContain('article-content');
  });

  it('penalizes nav-class containers even when they have lots of link text', () => {
    const { root } = setupFromHtml(`
      <div class="primary-nav">
        ${Array.from({ length: 50 })
          .map((_, i) => `<a href="/p${i}">${'menu item '.repeat(4)}</a>`)
          .join('\n')}
      </div>
      <div id="main-content">
        <p>${'Real article body. '.repeat(40)}</p>
        <p>${'Real article body. '.repeat(40)}</p>
      </div>
    `);
    const winner = pickReadabilityMain(root);
    expect(winner?.ref.selector_hints.css).toContain('main-content');
  });

  it('penalizes high link density', () => {
    const { root } = setupFromHtml(`
      <div id="link-farm">
        ${Array.from({ length: 60 })
          .map((_, i) => `<a href="/x${i}">${'link text '.repeat(4)}</a>`)
          .join('\n')}
      </div>
      <div id="article-body">
        <p>${'Prose with no links inside. '.repeat(40)}</p>
        <p>${'More prose with no links. '.repeat(40)}</p>
      </div>
    `);
    const winner = pickReadabilityMain(root);
    expect(winner?.ref.selector_hints.css).toContain('article-body');
  });

  it('returns the article tag when present', () => {
    const { root } = setupFromHtml(`
      <div class="ads">
        <p>${'Ad copy. '.repeat(40)}</p>
      </div>
      <article>
        <h1>Title</h1>
        <p>${'Article body. '.repeat(40)}</p>
      </article>
    `);
    const winner = pickReadabilityMain(root);
    expect(winner?.tag).toBe('article');
  });

  it('does not return the root itself (only descendants)', () => {
    const { root } = setupFromHtml(
      '<div><p>' + 'enough text here. '.repeat(40) + '</p></div>'
    );
    const winner = pickReadabilityMain(root);
    expect(winner).not.toBe(root);
  });
});
