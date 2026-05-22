import { describe, expect, it } from 'vitest';
import {
  estimateCost,
  formatCostUsd,
  pricingForModel,
  SONNET_4_6_PRICING,
  HAIKU_4_5_PRICING,
} from '@/shared/pricing';

describe('estimateCost', () => {
  it('returns 0 for zero usage', () => {
    expect(
      estimateCost(
        { input_tokens: 0, output_tokens: 0 },
        SONNET_4_6_PRICING
      )
    ).toBe(0);
  });

  it('computes input + output for a cold call', () => {
    const cost = estimateCost(
      { input_tokens: 1_000_000, output_tokens: 100_000 },
      SONNET_4_6_PRICING
    );
    // 1M * $3 + 100K * $15/M = $3 + $1.5 = $4.5
    expect(cost).toBeCloseTo(4.5, 6);
  });

  it('adds cache_write cost when cache_creation_input_tokens is set', () => {
    const cost = estimateCost(
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 1_000_000,
      },
      SONNET_4_6_PRICING
    );
    expect(cost).toBeCloseTo(3.75, 6);
  });

  it('adds cache_read cost (cheap) when cache_read_input_tokens is set', () => {
    const cost = estimateCost(
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 1_000_000,
      },
      SONNET_4_6_PRICING
    );
    expect(cost).toBeCloseTo(0.3, 6);
  });

  it('a cache-hit call is cheaper than a cold call (input-heavy)', () => {
    const cold = estimateCost(
      { input_tokens: 100_000, output_tokens: 500 },
      SONNET_4_6_PRICING
    );
    const hot = estimateCost(
      {
        input_tokens: 0,
        output_tokens: 500,
        cache_read_input_tokens: 100_000,
      },
      SONNET_4_6_PRICING
    );
    expect(hot).toBeLessThan(cold);
    // Cache reads are ~10x cheaper than cache misses for the input subset.
    const inputOnlyCold = estimateCost(
      { input_tokens: 100_000, output_tokens: 0 },
      SONNET_4_6_PRICING
    );
    const inputOnlyHot = estimateCost(
      { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 100_000 },
      SONNET_4_6_PRICING
    );
    expect(inputOnlyHot).toBeLessThan(inputOnlyCold / 5);
  });
});

describe('formatCostUsd', () => {
  it('renders zero', () => {
    expect(formatCostUsd(0)).toBe('$0.00');
  });
  it('renders ordinary cents', () => {
    expect(formatCostUsd(0.06)).toBe('$0.06');
    expect(formatCostUsd(1.5)).toBe('$1.50');
  });
  it('renders sub-cent amounts at 4 places', () => {
    expect(formatCostUsd(0.0012)).toBe('$0.0012');
  });
});

describe('pricingForModel', () => {
  it('resolves Sonnet variants', () => {
    expect(pricingForModel('claude-sonnet-4-6')).toBe(SONNET_4_6_PRICING);
    expect(pricingForModel('claude-sonnet-4-6-20251001')).toBe(SONNET_4_6_PRICING);
  });
  it('resolves Haiku variants', () => {
    expect(pricingForModel('claude-haiku-4-5')).toBe(HAIKU_4_5_PRICING);
    expect(pricingForModel('claude-haiku-4-5-20251001')).toBe(HAIKU_4_5_PRICING);
  });
  it('defaults to Sonnet pricing for unknown models (conservative)', () => {
    expect(pricingForModel('claude-some-future-model')).toBe(SONNET_4_6_PRICING);
  });
});
