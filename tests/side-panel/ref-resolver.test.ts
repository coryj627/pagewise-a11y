import { describe, expect, it, beforeEach } from 'vitest';
import { buildPanelRefResolver } from '@/side-panel/ref-resolver';
import { extractPageModel } from '@/content/extract/page-model';

describe('buildPanelRefResolver', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves every ref the extractor put into the tree', () => {
    document.body.innerHTML = `
      <main>
        <h1>Title</h1>
        <form><input type="search" /></form>
        <button>Save</button>
      </main>
    `;
    const { pageModel } = extractPageModel(document);
    const resolve = buildPanelRefResolver(pageModel);

    const collected = new Set<string>();
    const collect = (el: typeof pageModel.main_content): void => {
      collected.add(el.ref.id);
      for (const c of el.children) collect(c);
    };
    collect(pageModel.main_content);

    for (const id of collected) {
      expect(resolve(id)).not.toBeNull();
      expect(resolve(id)?.id).toBe(id);
    }
  });

  it('returns null for unknown ids', () => {
    document.body.innerHTML = '<main></main>';
    const { pageModel } = extractPageModel(document);
    const resolve = buildPanelRefResolver(pageModel);
    expect(resolve('n_does_not_exist')).toBeNull();
    expect(resolve('not even formatted right')).toBeNull();
  });

  it('resolves refs from deterministic_candidates and interaction_surface', () => {
    document.body.innerHTML = `
      <main>
        <h1>X</h1>
        <form><input type="search" /></form>
      </main>
    `;
    const { pageModel } = extractPageModel(document);
    const resolve = buildPanelRefResolver(pageModel);
    for (const c of pageModel.deterministic_candidates) {
      expect(resolve(c.id)).not.toBeNull();
    }
    for (const f of pageModel.interaction_surface.forms) {
      expect(resolve(f.ref.id)).not.toBeNull();
    }
  });
});
