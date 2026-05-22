/**
 * Token estimation for cost disclosure. Not exact — uses a chars-per-token
 * heuristic that's roughly right for English prose + JSON. The actual
 * Anthropic API call returns precise usage; this is for the "About to
 * analyze this page" prompt before the call.
 *
 * For a verified count, callers can fall back to the SDK's count_tokens
 * endpoint, at the cost of an extra round trip.
 */

/**
 * ~4 chars per token is a defensible average for English; JSON is closer
 * to 3 because of punctuation density. Pagewise input is a mix; 4 is a
 * mildly-optimistic estimate. We round up to be conservative.
 */
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface RequestTokenBreakdown {
  /** Total tokens across system + tools + user message. */
  total: number;
  /** Tokens that live in the stable cache prefix (system + tools). */
  cache_eligible: number;
  /** Tokens after the cache breakpoint — typically the PageModel payload. */
  fresh: number;
}

export function estimateRequestTokens(parts: {
  systemPrompt: string;
  toolsJson: string;
  userMessage: string;
}): RequestTokenBreakdown {
  const systemTokens = estimateTokens(parts.systemPrompt);
  const toolTokens = estimateTokens(parts.toolsJson);
  const userTokens = estimateTokens(parts.userMessage);
  return {
    total: systemTokens + toolTokens + userTokens,
    cache_eligible: systemTokens + toolTokens,
    fresh: userTokens,
  };
}
