import { describe, expect, it } from 'vitest';
import { estimateTokens, estimateRequestTokens } from '@/shared/tokens';

describe('estimateTokens', () => {
  it('returns 0 for empty input', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns ceil(length / 4)', () => {
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });
});

describe('estimateRequestTokens', () => {
  it('reports total = cache_eligible + fresh', () => {
    const b = estimateRequestTokens({
      systemPrompt: 'x'.repeat(40),  // 10 tokens
      toolsJson: 'y'.repeat(20),     // 5 tokens
      userMessage: 'z'.repeat(80),   // 20 tokens
    });
    expect(b.cache_eligible).toBe(15);
    expect(b.fresh).toBe(20);
    expect(b.total).toBe(35);
    expect(b.total).toBe(b.cache_eligible + b.fresh);
  });

  it('handles empty parts', () => {
    expect(
      estimateRequestTokens({ systemPrompt: '', toolsJson: '', userMessage: '' })
    ).toEqual({ total: 0, cache_eligible: 0, fresh: 0 });
  });
});
