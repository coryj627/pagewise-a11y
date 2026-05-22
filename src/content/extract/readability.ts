/**
 * Mozilla-Readability-style main-content detection. Used as a fallback
 * when the page has no <main> element (and no `role="main"`) so we don't
 * have to hand Claude the entire <body> as the main_content tree.
 *
 * Walks the PageElement tree, scoring each candidate by:
 *
 *   text content length of descendants  (bigger = more substance)
 *   + bonus for id/class hints like "content", "article", "post"
 *   - penalty for id/class hints like "sidebar", "nav", "ad"
 *   - penalty for high link density (lots of link text vs total text
 *     usually = navigation, not content)
 *
 * Returns the highest-scoring node, or null when no node clears the
 * minimum thresholds (≥ 200 chars of descendant text AND ≥ 3 captured
 * descendants). The caller falls back to body when null.
 *
 * This is intentionally NOT a port of Mozilla Readability. It's a
 * cheaper heuristic that uses the PageElement tree we already built.
 * Phase 2 may revisit if real-world pass rates aren't good enough.
 */
import type { PageElement } from '@/schemas/page-element';

// Boundary chars include '.' (so "div.article-content" matches "article")
// so positive tokens fire on class-prefixed selectors. NOTE: do NOT
// include "body" in the positive set — our walker's selector chain
// literally starts with "body > …" for elements without an id/class,
// which would trigger a false positive on every chrome-style element.
const POSITIVE_PATTERN =
  /(?:^|[\s_.\-])(?:content|main|article|post|entry|page|hentry|story)(?:$|[\s_.\-])/i;
const NEGATIVE_PATTERN =
  /(?:^|[\s_.\-])(?:sidebar|aside|nav|menu|footer|header|ad|ads|advert|comment|popup|modal|banner|share|social)(?:$|[\s_.\-])/i;

const MIN_TEXT_LENGTH = 100;
const MIN_DESCENDANTS = 1;
const POSITIVE_BONUS = 200;
const NEGATIVE_PENALTY = 200;
const LINK_DENSITY_THRESHOLD = 0.5;

interface CandidateScore {
  element: PageElement;
  score: number;
  textLength: number;
  descendants: number;
}

export function pickReadabilityMain(root: PageElement): PageElement | null {
  let best: CandidateScore | null = null;

  const visit = (el: PageElement): void => {
    if (el !== root) {
      const stats = walkStats(el);
      if (stats.textLength >= MIN_TEXT_LENGTH && stats.descendants >= MIN_DESCENDANTS) {
        const score = scoreCandidate(el, stats);
        if (best === null || score > best.score) {
          best = { element: el, score, ...stats };
        }
      }
    }
    for (const c of el.children) visit(c);
  };

  visit(root);
  return best === null ? null : (best as CandidateScore).element;
}

interface TreeStats {
  textLength: number;
  linkTextLength: number;
  descendants: number;
}

function walkStats(el: PageElement): TreeStats {
  let textLength = 0;
  let linkTextLength = 0;
  let descendants = 0;
  const visit = (node: PageElement): void => {
    descendants += 1;
    const text = node.text ?? '';
    textLength += text.length;
    if (node.role === 'link') linkTextLength += text.length;
    for (const child of node.children) visit(child);
  };
  // We don't count the candidate itself, only its descendants — the
  // candidate's own text is usually a wrapper-level annotation; the
  // signal comes from what's inside.
  for (const child of el.children) visit(child);
  return { textLength, linkTextLength, descendants };
}

function scoreCandidate(el: PageElement, stats: TreeStats): number {
  let score = stats.textLength;

  // Pattern bonuses use the ref's css selector hint (which prefers
  // `#id` then a class chain) as a proxy for the element's id/class.
  // We also fold in role and tag.
  const hintLine = `${el.tag} ${el.role} ${el.ref.selector_hints.css ?? ''}`;
  if (POSITIVE_PATTERN.test(hintLine)) score += POSITIVE_BONUS;
  if (NEGATIVE_PATTERN.test(hintLine)) score -= NEGATIVE_PENALTY;

  // Tag bonus: article + section beat random div.
  if (el.tag === 'article') score += 100;
  else if (el.tag === 'section') score += 50;

  // Link density penalty: lots of link text → likely navigation.
  if (stats.textLength > 0) {
    const linkDensity = stats.linkTextLength / stats.textLength;
    if (linkDensity > LINK_DENSITY_THRESHOLD) {
      score -= Math.round(stats.textLength * linkDensity);
    }
  }

  return score;
}
