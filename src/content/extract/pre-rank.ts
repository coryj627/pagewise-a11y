import type { NodeRef } from '@/schemas/node-ref';
import type { PageElement } from '@/schemas/page-element';

const PAGINATION_LABEL = /^(next|previous|prev|page\s+\d+)$/i;

export interface PreRankInput {
  root: PageElement;
  main: PageElement;
  all: PageElement[];
  landmarks: PageElement[];
  forms: PageElement[];
  primaryButtons: PageElement[];
  searchInputs: PageElement[];
}

/**
 * Order the deterministic candidate list given to Claude (via PageModel).
 * Priority reflects what a competent screen-reader user reaches for first
 * when orienting on a new page:
 *
 *   main → first H1 → search input → alert/status regions → dialogs
 *   → forms → pagination links → primary buttons → other landmarks
 *   → tables
 *
 * Duplicates are removed by ref.id. There is no hard cap here; the model's
 * jump_list output is capped at 10 in its own schema, and Claude is
 * instructed to select / rank from this list rather than invent jump
 * targets. See architecture.md §8.1 "Deterministic pre-ranking".
 */
export function pickDeterministicCandidates(input: PreRankInput): NodeRef[] {
  const out: NodeRef[] = [];
  const seen = new Set<string>();
  const push = (el: PageElement | undefined): void => {
    if (el === undefined) return;
    if (seen.has(el.ref.id)) return;
    seen.add(el.ref.id);
    out.push(el.ref);
  };
  const pushMany = (els: ReadonlyArray<PageElement>): void => {
    for (const el of els) push(el);
  };

  // 1. main (skip when it is also the root — we never want to "jump to body")
  if (input.main !== input.root) push(input.main);

  // 2. first H1 (heading with level 1), otherwise first heading
  const h1 =
    input.all.find((el) => el.role === 'heading' && el.level === 1) ??
    input.all.find((el) => el.role === 'heading');
  push(h1);

  // 3. first search input
  push(input.searchInputs[0]);

  // 4. alert / status regions
  pushMany(
    input.all.filter((el) => el.role === 'alert' || el.role === 'alertdialog')
  );
  pushMany(input.all.filter((el) => el.role === 'status'));

  // 5. dialogs
  pushMany(input.all.filter((el) => el.role === 'dialog'));

  // 6. first form
  push(input.forms[0]);

  // 7. pagination links — links whose accessible name matches the pagination
  // pattern (next, prev, "page 3", etc.)
  pushMany(
    input.all.filter(
      (el) =>
        el.role === 'link' &&
        el.name !== undefined &&
        PAGINATION_LABEL.test(el.name.trim())
    )
  );

  // 8. primary buttons (top N already chosen by caller)
  pushMany(input.primaryButtons);

  // 9. other landmarks (skip main, which we already pushed)
  pushMany(input.landmarks.filter((lm) => lm !== input.main));

  // 10. tables and grids
  pushMany(
    input.all.filter(
      (el) => el.role === 'table' || el.role === 'grid' || el.role === 'treegrid'
    )
  );

  return out;
}
