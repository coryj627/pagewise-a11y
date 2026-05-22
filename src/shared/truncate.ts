/**
 * PageModel truncation. When the serialized PageModel would push the
 * Claude input above a budget, we shrink it before the request leaves
 * the side panel. Architecture §11.4 acceptance criterion: PageModel
 * either fits the token / storage budget or is gracefully truncated
 * with `large_page_truncated` surfaced.
 *
 * Strategy: limit the depth of `main_content`. Landmarks and the
 * interaction_surface (forms / primary_buttons / search_inputs) stay
 * intact because they're the model's highest-signal input — losing
 * them costs more than losing deep prose nodes.
 *
 * If even main_content at depth 1 is too big, we drop the rest of
 * main_content's children and rely on landmarks + interaction surface
 * to keep the orientation useful.
 */
import type { PageModel } from '@/schemas/page-model';
import type { PageElement } from '@/schemas/page-element';
import type {
  PageCapabilityReport,
  CapabilityReason,
} from '@/schemas/capability-report';
import { estimateTokens } from './tokens';

/** Default budget for the *serialized PageModel only* — system + tools live separately. */
export const DEFAULT_PAGEMODEL_TOKEN_BUDGET = 50_000;

const DEPTH_LADDER: ReadonlyArray<number> = [6, 5, 4, 3, 2, 1, 0];

export interface TruncateResult {
  pageModel: PageModel;
  capability: PageCapabilityReport;
  truncated: boolean;
  strategy?: string;
  omittedSubtrees?: number;
}

export function estimatePageModelTokens(pageModel: PageModel): number {
  return estimateTokens(JSON.stringify(pageModel));
}

/**
 * If the serialized PageModel exceeds `budget` tokens, depth-limit
 * `main_content` until it fits. landmarks + interaction_surface +
 * deterministic_candidates stay untouched.
 */
export function truncatePageModel(
  pageModel: PageModel,
  capability: PageCapabilityReport,
  budget: number = DEFAULT_PAGEMODEL_TOKEN_BUDGET
): TruncateResult {
  const initialTokens = estimatePageModelTokens(pageModel);
  if (initialTokens <= budget) {
    return { pageModel, capability, truncated: false };
  }

  for (const maxDepth of DEPTH_LADDER) {
    const omitCounter = { count: 0 };
    const trimmedMain = limitDepth(pageModel.main_content, maxDepth, omitCounter);
    const candidate: PageModel = {
      ...pageModel,
      main_content: trimmedMain,
    };
    const tokens = estimatePageModelTokens(candidate);
    if (tokens <= budget) {
      const strategy = `limit_main_content_depth_${maxDepth}`;
      const reasons: CapabilityReason[] = capability.reasons.includes(
        'large_page_truncated'
      )
        ? [...capability.reasons]
        : [...capability.reasons, 'large_page_truncated'];
      const updatedCapability: PageCapabilityReport = {
        ...capability,
        reasons,
        truncation: {
          applied: true,
          strategy,
          omitted_sections: omitCounter.count,
        },
      };
      return {
        pageModel: candidate,
        capability: updatedCapability,
        truncated: true,
        strategy,
        omittedSubtrees: omitCounter.count,
      };
    }
  }

  // We reached depth 0 (children stripped from main_content) and we still
  // exceed budget. Send what we have — it'll be cramped but the panel can
  // announce the situation via large_page_truncated.
  const omitCounter = { count: 0 };
  const trimmedMain = limitDepth(pageModel.main_content, 0, omitCounter);
  const candidate: PageModel = {
    ...pageModel,
    main_content: trimmedMain,
  };
  const strategy = 'main_content_stripped_to_root';
  const reasons: CapabilityReason[] = capability.reasons.includes(
    'large_page_truncated'
  )
    ? [...capability.reasons]
    : [...capability.reasons, 'large_page_truncated'];
  return {
    pageModel: candidate,
    capability: {
      ...capability,
      reasons,
      truncation: {
        applied: true,
        strategy,
        omitted_sections: omitCounter.count,
      },
    },
    truncated: true,
    strategy,
    omittedSubtrees: omitCounter.count,
  };
}

/**
 * Return a copy of the subtree with descendants beyond `maxDepth`
 * pruned. The root is depth 0; passing maxDepth=0 strips all children.
 * `counter.count` accumulates the total number of subtrees that were
 * removed so the truncation report can surface how much was dropped.
 */
/** Length above which a leaf node's text is replaced with an elided form. */
const PER_NODE_TEXT_CAP = 800;

function limitDepth(
  el: PageElement,
  maxDepth: number,
  counter: { count: number }
): PageElement {
  if (maxDepth <= 0) {
    if (el.children.length > 0) counter.count += countSubtrees(el.children);
    return capText({ ...el, children: [] });
  }
  return capText({
    ...el,
    children: el.children.map((c) => limitDepth(c, maxDepth - 1, counter)),
  });
}

/**
 * Drop pathological text payloads (an entire inline-scripted blob ending
 * up as a single text node, a 1 MB legal document, etc.). Per-node cap
 * preserves the first chunk so the model still has a hint of what the
 * node was about.
 */
function capText(el: PageElement): PageElement {
  if (el.text === undefined || el.text.length <= PER_NODE_TEXT_CAP) return el;
  return {
    ...el,
    text: `${el.text.slice(0, PER_NODE_TEXT_CAP)}… [truncated]`,
  };
}

function countSubtrees(children: ReadonlyArray<PageElement>): number {
  // One subtree per direct child (we count what was pruned at this
  // boundary, not every removed node).
  return children.length;
}
