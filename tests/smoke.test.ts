import { describe, expect, it } from 'vitest';
import { PAGEWISE_VERSION, SCHEMA_VERSION } from '@shared/constants';

describe('scaffold smoke', () => {
  it('exposes constants', () => {
    expect(PAGEWISE_VERSION).toBe('0.0.0');
    expect(SCHEMA_VERSION).toBe(2);
  });

  it('runs in jsdom', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });
});
