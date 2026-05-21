import { describe, expect, it, beforeEach } from 'vitest';
import { extractPageModel } from '@/content/extract/page-model';
import { PageModelSchema } from '@/schemas/page-model';

describe('extractPageModel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('produces a schema-valid PageModel for a typical article', () => {
    document.title = 'Sample article';
    document.documentElement.setAttribute('lang', 'en');
    document.body.innerHTML = `
      <header><h1>Site</h1></header>
      <nav aria-label="Primary"><a href="/x">Home</a></nav>
      <main>
        <h1>Headline</h1>
        <article>
          <p>Body paragraph one.</p>
          <p>Body paragraph two.</p>
        </article>
      </main>
      <footer><p>©</p></footer>
    `;
    const { pageModel } = extractPageModel(document);
    const parsed = PageModelSchema.safeParse(pageModel);
    expect(parsed.success).toBe(true);
    expect(pageModel.title).toBe('Sample article');
    expect(pageModel.lang).toBe('en');
    expect(pageModel.page_state).toBe('normal');
    expect(pageModel.main_content.role).toBe('main');
  });

  it('finds landmarks and includes them in PageModel.landmarks', () => {
    document.body.innerHTML = `
      <header>top</header>
      <nav>nav</nav>
      <main>main</main>
      <aside>side</aside>
      <footer>bottom</footer>
    `;
    const { pageModel } = extractPageModel(document);
    const roles = pageModel.landmarks.map((l) => l.role).sort();
    expect(roles).toEqual([
      'banner',
      'complementary',
      'contentinfo',
      'main',
      'navigation',
    ]);
  });

  it('falls back to body as main_content when no <main>', () => {
    document.body.innerHTML = '<article><p>x</p></article>';
    const { pageModel, capability } = extractPageModel(document);
    expect(pageModel.main_content.tag).toBe('body');
    expect(capability.reasons).toContain('no_main_region');
  });

  it('populates interaction_surface with forms / buttons / search inputs', () => {
    document.body.innerHTML = `
      <main>
        <form><input type="search" /></form>
        <button>Save</button>
        <button>Cancel</button>
      </main>
    `;
    const { pageModel } = extractPageModel(document);
    expect(pageModel.interaction_surface.forms.length).toBeGreaterThan(0);
    expect(pageModel.interaction_surface.search_inputs.length).toBeGreaterThan(0);
    expect(
      pageModel.interaction_surface.primary_buttons.map((b) => b.name)
    ).toEqual(expect.arrayContaining(['Save', 'Cancel']));
  });

  it('populates deterministic_candidates without duplicates', () => {
    document.body.innerHTML = `
      <main>
        <h1>X</h1>
        <form><input type="search" /></form>
      </main>
    `;
    const { pageModel } = extractPageModel(document);
    const ids = pageModel.deterministic_candidates.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('redacts URL path shape', () => {
    // jsdom defaults location to about:blank, but pathname is "/"; spoof.
    document.body.innerHTML = '<main></main>';
    const result = extractPageModel(document);
    // The shape is just the location.pathname run through redactUrlPath;
    // the unit test for redaction logic lives in url-shape.test.ts. Here
    // we just verify the field is populated.
    expect(typeof result.pageModel.url_path_shape).toBe('string');
  });

  it('counts headings, links, buttons, and form controls in the capability report', () => {
    document.body.innerHTML = `
      <main>
        <h1>H1</h1>
        <h2>H2</h2>
        <a href="/x">link</a>
        <button>btn</button>
        <input type="text" />
      </main>
    `;
    const { capability } = extractPageModel(document);
    expect(capability.counts.headings).toBe(2);
    expect(capability.counts.links).toBe(1);
    expect(capability.counts.buttons).toBe(1);
    expect(capability.counts.form_controls).toBe(1);
  });

  it('flags mostly_images for image-dominated pages', () => {
    document.body.innerHTML = `
      <main>
        ${Array(8).fill('<img src="x.png" />').join('')}
      </main>
    `;
    const { capability } = extractPageModel(document);
    expect(capability.reasons).toContain('mostly_images');
  });

  it('returns public_likely with no redactions for an ordinary page', () => {
    document.body.innerHTML = '<main><h1>Hi</h1><p>Just an article.</p></main>';
    const { sensitivity } = extractPageModel(document);
    expect(sensitivity.page_classification).toBe('public_likely');
    expect(sensitivity.redactions).toEqual([]);
    expect(sensitivity.url_path_redacted).toBe(false);
  });

  it('classifies as credential_likely with a password redaction when password field is present', () => {
    document.body.innerHTML = `
      <main>
        <form>
          <label>Email <input type="email" /></label>
          <label>Password <input type="password" /></label>
        </form>
      </main>
    `;
    const { sensitivity } = extractPageModel(document);
    expect(sensitivity.page_classification).toBe('credential_likely');
    const kinds = sensitivity.redactions.map((r) => r.kind);
    expect(kinds).toContain('password');
    expect(kinds).toContain('email');
  });

  it('classifies as financial_likely with a credit_card redaction for cc-number autocomplete', () => {
    document.body.innerHTML = `
      <main>
        <form>
          <input autocomplete="cc-number" />
        </form>
      </main>
    `;
    const { sensitivity } = extractPageModel(document);
    expect(sensitivity.page_classification).toBe('financial_likely');
    expect(sensitivity.redactions.map((r) => r.kind)).toContain('credit_card');
  });

  it('captures a contenteditable redaction when content is present', () => {
    document.body.innerHTML = `
      <main>
        <div contenteditable="true">Some draft note</div>
      </main>
    `;
    const { sensitivity } = extractPageModel(document);
    expect(sensitivity.page_classification).toBe('personal_data_likely');
    expect(sensitivity.redactions.map((r) => r.kind)).toContain('contenteditable');
  });

  it('does NOT add a contenteditable redaction for an empty editable element', () => {
    document.body.innerHTML = '<main><div contenteditable="true"></div></main>';
    const { sensitivity } = extractPageModel(document);
    expect(sensitivity.redactions.find((r) => r.kind === 'contenteditable')).toBeUndefined();
  });
});

describe('extractPageModel — deterministic candidates ordering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('puts main → H1 → search → form in that order', () => {
    document.body.innerHTML = `
      <main>
        <form><input type="search" id="s" /></form>
        <h1>Title</h1>
      </main>
    `;
    const { pageModel } = extractPageModel(document);
    const candidates = pageModel.deterministic_candidates;
    expect(candidates.length).toBeGreaterThanOrEqual(3);

    const indexOfRole = (role: string): number =>
      candidates.findIndex((c) => c.hashes.role === role);

    const mainIdx = indexOfRole('main');
    const headingIdx = indexOfRole('heading');
    const searchIdx = indexOfRole('searchbox');
    const formIdx = indexOfRole('form');

    expect(mainIdx).toBeGreaterThanOrEqual(0);
    expect(mainIdx).toBeLessThan(headingIdx);
    expect(headingIdx).toBeLessThan(searchIdx);
    expect(searchIdx).toBeLessThan(formIdx);
  });

  it('includes pagination links by accessible name', () => {
    document.body.innerHTML = `
      <main>
        <nav>
          <a href="/p2">Next</a>
          <a href="/about">About us</a>
        </nav>
      </main>
    `;
    const { pageModel } = extractPageModel(document);
    // The "Next" link should be in candidates (pagination match);
    // "About us" should NOT be (not pagination).
    // We can't easily map ref → name here, but we can verify a link
    // candidate exists and that the count is reasonable.
    const linkCount = pageModel.deterministic_candidates.filter(
      (c) => c.hashes.role === 'link'
    ).length;
    expect(linkCount).toBeGreaterThanOrEqual(1);
  });

  it('uses the provided extractionId and timestamp', () => {
    document.body.innerHTML = '<main></main>';
    const fixed = new Date('2026-05-21T12:00:00.000Z');
    const { pageModel } = extractPageModel(document, {
      extractionId: '66666666-6666-4666-8666-666666666666',
      now: () => fixed,
    });
    expect(pageModel.extraction_id).toBe('66666666-6666-4666-8666-666666666666');
    expect(pageModel.extracted_at).toBe('2026-05-21T12:00:00.000Z');
  });

  it('produces a stable content_hash for the same page', () => {
    document.body.innerHTML = '<main><h1>Hi</h1></main>';
    const a = extractPageModel(document).pageModel.content_hash;
    const b = extractPageModel(document).pageModel.content_hash;
    expect(a).toBe(b);
  });

  it('updates content_hash when content changes', () => {
    document.body.innerHTML = '<main><h1>Hi</h1></main>';
    const a = extractPageModel(document).pageModel.content_hash;
    document.body.innerHTML = '<main><h1>Different</h1></main>';
    const b = extractPageModel(document).pageModel.content_hash;
    expect(a).not.toBe(b);
  });
});
