import { computeAccessibleName } from 'dom-accessibility-api';
import type { PageElement } from '@/schemas/page-element';

export type NameSource = NonNullable<PageElement['name_source']>;

export type ComputedName = {
  name: string;
  source: NameSource;
};

/**
 * Compute the accessible name for an element using the WAI-ARIA AccName
 * algorithm (via `dom-accessibility-api`), then classify the source so the
 * extractor can record it on the PageElement.
 *
 * Source detection mirrors AccName's precedence: aria-labelledby beats
 * aria-label beats label-for-control beats element contents beats title
 * beats alt.
 */
export function computeName(element: Element): ComputedName {
  let name = '';
  try {
    name = computeAccessibleName(element).trim();
  } catch {
    name = '';
  }

  if (name === '') return { name: '', source: 'none' };

  if (element.hasAttribute('aria-labelledby')) {
    return { name, source: 'aria-labelledby' };
  }
  if (element.hasAttribute('aria-label')) {
    return { name, source: 'aria-label' };
  }
  if (isLabelledByHostLabel(element)) {
    return { name, source: 'label' };
  }
  if (element.tagName.toLowerCase() === 'img' && element.hasAttribute('alt')) {
    return { name, source: 'alt' };
  }
  if (element.hasAttribute('title') && !hasMeaningfulTextContent(element)) {
    return { name, source: 'title' };
  }
  return { name, source: 'text' };
}

function isLabelledByHostLabel(element: Element): boolean {
  // Only form controls can be labelled by <label>. `labels` is a NodeList of
  // associated label elements, populated when an id+for or wrapping <label>
  // is present.
  const labels = (element as HTMLInputElement).labels;
  return labels !== null && labels !== undefined && labels.length > 0;
}

function hasMeaningfulTextContent(element: Element): boolean {
  const text = (element.textContent ?? '').trim();
  return text.length > 0;
}
