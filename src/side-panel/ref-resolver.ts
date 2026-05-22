import type { PageModel } from '@/schemas/page-model';
import type { PageElement } from '@/schemas/page-element';
import type { NodeRef } from '@/schemas/node-ref';

/**
 * Build an in-panel ref resolver from the PageModel the content script
 * sent. The side panel never holds the live RefRegistry (that lives in
 * the content script's context); for Anthropic-call validation it only
 * needs to confirm that a model-returned node_ref_id corresponds to a
 * NodeRef the extraction actually produced. Walking the PageModel tree
 * once and caching ref-by-id is sufficient.
 *
 * The returned function is used as {@link OrientationCallInput.resolveRef}
 * to drive validateToolOutput's "drop unresolvable refs" pass.
 */
export function buildPanelRefResolver(
  pageModel: PageModel
): (id: string) => NodeRef | null {
  const byId = new Map<string, NodeRef>();
  const visit = (el: PageElement): void => {
    byId.set(el.ref.id, el.ref);
    for (const c of el.children) visit(c);
  };
  visit(pageModel.main_content);
  for (const lm of pageModel.landmarks) visit(lm);
  for (const f of pageModel.interaction_surface.forms) visit(f);
  for (const b of pageModel.interaction_surface.primary_buttons) visit(b);
  for (const s of pageModel.interaction_surface.search_inputs) visit(s);
  for (const ref of pageModel.deterministic_candidates) byId.set(ref.id, ref);

  return (id: string): NodeRef | null => byId.get(id) ?? null;
}
