/**
 * Anthropic API pricing tables and cost estimation. The exact rates change
 * over time — these constants should be checked against the current
 * https://www.anthropic.com/pricing page periodically.
 */

export interface ModelPricing {
  /** USD per million input tokens (cache-miss). */
  input_per_million: number;
  /** USD per million output tokens. */
  output_per_million: number;
  /** USD per million tokens written into the prompt cache. */
  cache_write_per_million: number;
  /** USD per million tokens served from the prompt cache. */
  cache_read_per_million: number;
}

/**
 * Pricing as of project knowledge cutoff. Verify against the Anthropic
 * pricing page before shipping; in particular cache pricing has evolved.
 */
export const SONNET_4_6_PRICING: ModelPricing = {
  input_per_million: 3.0,
  output_per_million: 15.0,
  cache_write_per_million: 3.75,
  cache_read_per_million: 0.3,
};

export const HAIKU_4_5_PRICING: ModelPricing = {
  input_per_million: 0.8,
  output_per_million: 4.0,
  cache_write_per_million: 1.0,
  cache_read_per_million: 0.08,
};

export interface TokenUsageBreakdown {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Compute the USD cost of a call given its token usage and pricing. The
 * Anthropic API counts cache writes and cache reads in separate fields;
 * `input_tokens` always represents the cache-miss subset.
 */
export function estimateCost(
  usage: TokenUsageBreakdown,
  pricing: ModelPricing
): number {
  const input = (usage.input_tokens / 1_000_000) * pricing.input_per_million;
  const output = (usage.output_tokens / 1_000_000) * pricing.output_per_million;
  const cacheWrite =
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) *
    pricing.cache_write_per_million;
  const cacheRead =
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) *
    pricing.cache_read_per_million;
  return input + output + cacheWrite + cacheRead;
}

/**
 * Render a USD amount the way the cost disclosure prompt does:
 * "about $0.06", "about $0.0012", etc. Always shows 2 sig-figs of cents.
 */
export function formatCostUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function pricingForModel(model: string): ModelPricing {
  // Match by model family prefix so version-specific suffixes still resolve.
  if (model.startsWith('claude-sonnet-4-6')) return SONNET_4_6_PRICING;
  if (model.startsWith('claude-haiku-4-5')) return HAIKU_4_5_PRICING;
  // Default to Sonnet pricing for unknown models — conservative; better to
  // overestimate cost in the disclosure prompt than underestimate.
  return SONNET_4_6_PRICING;
}
