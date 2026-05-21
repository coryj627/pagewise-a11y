import type { PageElement } from '@/schemas/page-element';

export type RoleSource = PageElement['role_source'];

export type ComputedRole = {
  role: string;
  source: RoleSource;
};

/**
 * Compute the ARIA role for an element. An explicit `role` attribute wins
 * (source 'aria'); otherwise we infer from the tag (source 'native'), and
 * fall back to 'generic' when nothing matches (source 'inferred').
 *
 * Not exhaustive — covers the subset our extractor cares about for
 * Phase 0. Full ARIA-in-HTML mapping would pull in `aria-query` which is
 * heavier than this Phase 0 milestone needs.
 */
export function computeRole(element: Element): ComputedRole {
  const explicit = element.getAttribute('role');
  if (explicit !== null && explicit !== '') {
    return { role: explicit.trim().toLowerCase(), source: 'aria' };
  }

  const native = nativeRoleForTag(element);
  if (native !== null) return { role: native, source: 'native' };

  return { role: 'generic', source: 'inferred' };
}

function nativeRoleForTag(element: Element): string | null {
  const tag = element.tagName.toLowerCase();

  switch (tag) {
    case 'a':
    case 'area':
      return element.hasAttribute('href') ? 'link' : 'generic';
    case 'article':
      return 'article';
    case 'aside':
      return 'complementary';
    case 'button':
      return 'button';
    case 'dialog':
      return 'dialog';
    case 'fieldset':
      return 'group';
    case 'figure':
      return 'figure';
    case 'footer':
      return isInLandmarkParent(element) ? 'generic' : 'contentinfo';
    case 'form':
      return 'form';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return 'heading';
    case 'header':
      return isInLandmarkParent(element) ? 'generic' : 'banner';
    case 'hr':
      return 'separator';
    case 'img':
      return imgRole(element);
    case 'input':
      return inputRole(element);
    case 'li':
      return 'listitem';
    case 'main':
      return 'main';
    case 'nav':
      return 'navigation';
    case 'ol':
    case 'ul':
    case 'menu':
      return 'list';
    case 'output':
      return 'status';
    case 'p':
      return 'paragraph';
    case 'progress':
      return 'progressbar';
    case 'search':
      return 'search';
    case 'section':
      return hasAccessibleNamingAttribute(element) ? 'region' : 'generic';
    case 'select':
      return (element as HTMLSelectElement).multiple || hasSize(element) ? 'listbox' : 'combobox';
    case 'summary':
      return 'button';
    case 'table':
      return 'table';
    case 'tbody':
    case 'thead':
    case 'tfoot':
      return 'rowgroup';
    case 'tr':
      return 'row';
    case 'td':
      return 'cell';
    case 'th':
      return thRole(element);
    case 'textarea':
      return 'textbox';
    case 'time':
      return 'time';
    default:
      return null;
  }
}

function imgRole(element: Element): string {
  const alt = element.getAttribute('alt');
  // alt="" → decorative → role="presentation" (a.k.a. "none")
  if (alt === '') return 'presentation';
  return 'img';
}

function inputRole(element: Element): string {
  const type = (element.getAttribute('type') ?? 'text').toLowerCase();
  switch (type) {
    case 'button':
    case 'image':
    case 'reset':
    case 'submit':
      return 'button';
    case 'checkbox':
      return 'checkbox';
    case 'radio':
      return 'radio';
    case 'range':
      return 'slider';
    case 'number':
      return 'spinbutton';
    case 'search':
      return 'searchbox';
    case 'email':
    case 'tel':
    case 'text':
    case 'url':
      return 'textbox';
    case 'password':
      return 'textbox'; // ARIA has no password role; AT announces password
    case 'hidden':
      return 'none';
    case 'color':
    case 'date':
    case 'datetime-local':
    case 'file':
    case 'month':
    case 'time':
    case 'week':
      return 'textbox';
    default:
      return 'textbox';
  }
}

function thRole(element: Element): string {
  const scope = (element.getAttribute('scope') ?? '').toLowerCase();
  if (scope === 'row') return 'rowheader';
  if (scope === 'col' || scope === 'colgroup') return 'columnheader';
  // Heuristic: th in the first row is a columnheader; this is what most
  // assistive tech assumes when scope is omitted.
  const parent = element.parentElement;
  if (parent !== null && parent.tagName.toLowerCase() === 'tr') {
    const tableSection = parent.parentElement;
    if (tableSection !== null && tableSection.firstElementChild === parent) {
      return 'columnheader';
    }
  }
  return 'columnheader';
}

function hasAccessibleNamingAttribute(element: Element): boolean {
  return (
    element.hasAttribute('aria-label') ||
    element.hasAttribute('aria-labelledby') ||
    element.hasAttribute('title')
  );
}

function isInLandmarkParent(element: Element): boolean {
  let cur: Element | null = element.parentElement;
  while (cur !== null) {
    const tag = cur.tagName.toLowerCase();
    if (
      tag === 'article' ||
      tag === 'aside' ||
      tag === 'main' ||
      tag === 'nav' ||
      tag === 'section'
    ) {
      return true;
    }
    cur = cur.parentElement;
  }
  return false;
}

function hasSize(element: Element): boolean {
  const raw = element.getAttribute('size');
  if (raw === null) return false;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 1;
}
