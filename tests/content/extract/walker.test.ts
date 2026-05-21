import { describe, expect, it, beforeEach } from 'vitest';
import { extractTree } from '@/content/extract/walker';
import { PageElementSchema } from '@/schemas/page-element';

describe('extractTree', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts a small page into a valid PageElement tree', () => {
    document.body.innerHTML = `
      <main>
        <h1>Title</h1>
        <p>Hello <strong>world</strong>!</p>
        <a href="/x">Read more</a>
      </main>
    `;

    const { root, registry, extractionId } = extractTree(document.body);

    expect(extractionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(root.tag).toBe('body');
    expect(PageElementSchema.safeParse(root).success).toBe(true);
    expect(registry.size).toBeGreaterThan(0);
  });

  it('captures the main → h1 path with correct roles and names', () => {
    document.body.innerHTML = '<main><h1>Title</h1></main>';
    const { root } = extractTree(document.body);

    expect(root.children).toHaveLength(1);
    const main = root.children[0]!;
    expect(main.tag).toBe('main');
    expect(main.role).toBe('main');
    expect(main.role_source).toBe('native');

    const h1 = main.children[0]!;
    expect(h1.tag).toBe('h1');
    expect(h1.role).toBe('heading');
    expect(h1.level).toBe(1);
    expect(h1.name).toBe('Title');
    expect(h1.text).toBe('Title');
  });

  it('skips hidden subtrees entirely', () => {
    document.body.innerHTML = `
      <main>
        <p>visible</p>
        <p style="display: none">hidden</p>
        <div hidden>also hidden</div>
        <p aria-hidden="true">also hidden</p>
      </main>
    `;
    const { root, registry } = extractTree(document.body);
    const main = root.children[0]!;
    expect(main.children).toHaveLength(1);
    expect(main.children[0]!.text).toBe('visible');

    // No hidden element should appear in the registry on its own merits.
    const hiddenElements = Array.from(
      document.querySelectorAll('[hidden], [aria-hidden="true"], [style*="display: none"]')
    );
    const registered = new Set(
      Array.from(registry.entries()).map(([, el]) => el)
    );
    for (const hidden of hiddenElements) {
      expect(registered.has(hidden)).toBe(false);
    }
  });

  it('skips script / style / meta / template', () => {
    document.body.innerHTML = `
      <main>
        <script>console.log('x');</script>
        <style>.x { color: red }</style>
        <template><span>not me</span></template>
        <p>real content</p>
      </main>
    `;
    const { root } = extractTree(document.body);
    const main = root.children[0]!;
    expect(main.children).toHaveLength(1);
    expect(main.children[0]!.text).toBe('real content');
  });

  it('every captured element is registered under its ref id', () => {
    document.body.innerHTML = '<main><h1>A</h1><p>B</p></main>';
    const { root, registry } = extractTree(document.body);

    function walk(el: typeof root, seen: string[] = []): string[] {
      seen.push(el.ref.id);
      for (const c of el.children) walk(c, seen);
      return seen;
    }
    const allIds = walk(root);

    for (const id of allIds) {
      expect(registry.has(id)).toBe(true);
    }
    expect(registry.size).toBe(allIds.length);
  });

  it('NodeRef ids match the n_<hex> regex', () => {
    document.body.innerHTML = '<main><h1>X</h1></main>';
    const { root, registry } = extractTree(document.body);
    expect(root.ref.id).toMatch(/^n_[0-9a-f]{5,}$/);
    for (const [id] of registry.entries()) {
      expect(id).toMatch(/^n_[0-9a-f]{5,}$/);
    }
  });

  it('builds CSS selector hints that resolve back to the element', () => {
    document.body.innerHTML =
      '<main><section id="intro"><h1>X</h1></section></main>';
    const { root } = extractTree(document.body);
    const section = root.children[0]!.children[0]!;
    expect(section.ref.selector_hints.css).toBe('#intro');
    expect(document.querySelector(section.ref.selector_hints.css!)).toBe(
      document.getElementById('intro')
    );
  });

  it('builds an xpath hint that resolves back to the element', () => {
    document.body.innerHTML = '<main><p>one</p><p>two</p></main>';
    const { root } = extractTree(document.body);
    const secondP = root.children[0]!.children[1]!;
    expect(secondP.ref.selector_hints.xpath).toContain('p[2]');
    const found = document.evaluate(
      secondP.ref.selector_hints.xpath!,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
    expect(found).toBeTruthy();
    expect((found as Element).textContent).toBe('two');
  });

  it('records href on <a> elements', () => {
    document.body.innerHTML = '<main><a href="/x">link</a></main>';
    const { root } = extractTree(document.body);
    const link = root.children[0]!.children[0]!;
    expect(link.role).toBe('link');
    expect(link.href).toBe('/x');
  });

  it('uses the provided extractionId', () => {
    document.body.innerHTML = '<main></main>';
    const id = '33333333-3333-4333-8333-333333333333';
    const { extractionId, registry, root } = extractTree(document.body, {
      extractionId: id,
    });
    expect(extractionId).toBe(id);
    expect(registry.extractionId).toBe(id);
    expect(root.ref.extraction_id).toBe(id);
  });

  it('aria hint carries the computed accessible name', () => {
    document.body.innerHTML =
      '<main><button aria-label="Close dialog">×</button></main>';
    const { root } = extractTree(document.body);
    const button = root.children[0]!.children[0]!;
    expect(button.role).toBe('button');
    expect(button.name).toBe('Close dialog');
    expect(button.ref.selector_hints.aria?.name).toBe('Close dialog');
  });

  it('throws when the root itself is hidden', () => {
    document.body.innerHTML = '<div id="r" hidden><p>x</p></div>';
    expect(() => extractTree(document.getElementById('r')!)).toThrow();
  });
});
