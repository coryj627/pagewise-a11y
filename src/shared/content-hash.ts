import { hashString } from '@/content/refs/hash';
import type { PageElement } from '@/schemas/page-element';

/**
 * Deterministic content hash of a {@link PageElement} subtree. Excludes
 * NodeRef ids and extraction_ids (which are randomized per extraction) so
 * the hash is stable across re-extractions of the same page.
 *
 * Used as PageModel.content_hash to detect "the page hasn't actually
 * changed" and as a cache key in the service worker's PageModel cache.
 */
export function hashPageElementTree(root: PageElement): string {
  let buf = '';
  const visit = (el: PageElement): void => {
    buf += `<${el.tag}|${el.role}`;
    if (el.name !== undefined) buf += `|n=${el.name}`;
    if (el.text !== undefined) buf += `|t=${el.text}`;
    if (el.level !== undefined) buf += `|l=${el.level}`;
    if (el.href !== undefined) buf += `|h=${el.href}`;
    buf += '>';
    for (const child of el.children) visit(child);
    buf += `</${el.tag}>`;
  };
  visit(root);
  return hashString(buf);
}
