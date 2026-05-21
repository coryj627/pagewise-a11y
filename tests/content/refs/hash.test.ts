import { describe, expect, it } from 'vitest';
import {
  hashString,
  hashName,
  hashText,
  normalizeForHash,
  NodeIdGenerator,
} from '@/content/refs/hash';

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('produces 8 lowercase hex chars', () => {
    const h = hashString('anything');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it('differentiates similar inputs', () => {
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(hashString('foo')).not.toBe(hashString('foO'));
  });

  it('produces a stable hash for empty string', () => {
    expect(hashString('')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('normalizeForHash', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(normalizeForHash(null)).toBe('');
    expect(normalizeForHash(undefined)).toBe('');
    expect(normalizeForHash('')).toBe('');
  });

  it('collapses whitespace, trims, and lowercases', () => {
    expect(normalizeForHash('  Sign\tIn  ')).toBe('sign in');
    expect(normalizeForHash('multi\n\nline')).toBe('multi line');
  });
});

describe('hashName / hashText', () => {
  it('treats whitespace and case variations as equivalent', () => {
    expect(hashName('Sign In')).toBe(hashName('  sign  in '));
    expect(hashText('Hello\tworld')).toBe(hashText('hello world'));
  });

  it('handles undefined input', () => {
    expect(hashName(undefined)).toBe(hashName(''));
    expect(hashText(undefined)).toBe(hashText(''));
  });
});

describe('NodeIdGenerator', () => {
  it('emits sequential ids in n_<hex> format', () => {
    const gen = new NodeIdGenerator();
    expect(gen.next()).toBe('n_00000');
    expect(gen.next()).toBe('n_00001');
    expect(gen.next()).toBe('n_00002');
  });

  it('pads to at least 5 hex chars', () => {
    const gen = new NodeIdGenerator();
    for (let i = 0; i < 16; i++) gen.next();
    expect(gen.next()).toBe('n_00010');
  });

  it('continues past 5 chars without breaking the regex', () => {
    const gen = new NodeIdGenerator();
    // skip ahead to exercise the boundary
    for (let i = 0; i < 0x100000; i++) gen.next();
    const id = gen.next();
    expect(id).toMatch(/^n_[0-9a-f]{5,}$/);
    expect(id.length).toBeGreaterThan('n_'.length + 5);
  });

  it('resets to zero', () => {
    const gen = new NodeIdGenerator();
    gen.next();
    gen.next();
    gen.reset();
    expect(gen.next()).toBe('n_00000');
  });

  it('tracks currentCount', () => {
    const gen = new NodeIdGenerator();
    expect(gen.currentCount).toBe(0);
    gen.next();
    gen.next();
    expect(gen.currentCount).toBe(2);
  });
});
