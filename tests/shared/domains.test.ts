import { describe, expect, it } from 'vitest';
import {
  normalizeDomain,
  buildOriginPattern,
  isSensitiveDomain,
  listSensitiveDomains,
} from '@/shared/domains';

describe('normalizeDomain', () => {
  it('accepts a bare hostname', () => {
    expect(normalizeDomain('example.com')).toEqual({
      kind: 'ok',
      host: 'example.com',
    });
  });

  it('strips scheme and path from a full URL', () => {
    expect(normalizeDomain('https://www.example.com/path?q=1')).toEqual({
      kind: 'ok',
      host: 'www.example.com',
    });
  });

  it('trims whitespace and lowercases', () => {
    expect(normalizeDomain('   EXAMPLE.com   ')).toEqual({
      kind: 'ok',
      host: 'example.com',
    });
  });

  it('strips trailing dot', () => {
    expect(normalizeDomain('example.com.')).toEqual({
      kind: 'ok',
      host: 'example.com',
    });
  });

  it('converts IDN to punycode', () => {
    expect(normalizeDomain('bücher.example.com')).toEqual({
      kind: 'ok',
      host: 'xn--bcher-kva.example.com',
    });
  });

  it('accepts localhost and IPs (development use)', () => {
    expect(normalizeDomain('localhost')).toEqual({ kind: 'ok', host: 'localhost' });
    expect(normalizeDomain('127.0.0.1')).toEqual({ kind: 'ok', host: '127.0.0.1' });
  });

  it.each([null, undefined, 42, {}, true])(
    'rejects non-string input (%p)',
    (input) => {
      expect(normalizeDomain(input)).toEqual({
        kind: 'invalid',
        reason: 'malformed',
      });
    }
  );

  it('rejects empty / whitespace input', () => {
    expect(normalizeDomain('')).toEqual({ kind: 'invalid', reason: 'empty' });
    expect(normalizeDomain('   ')).toEqual({ kind: 'invalid', reason: 'empty' });
  });

  it('rejects obvious garbage', () => {
    expect(normalizeDomain('not a hostname').kind).toBe('invalid');
    expect(normalizeDomain('http://').kind).toBe('invalid');
  });
});

describe('buildOriginPattern', () => {
  it('defaults to https', () => {
    expect(buildOriginPattern('example.com')).toBe('https://example.com/*');
  });

  it('accepts http explicitly', () => {
    expect(buildOriginPattern('localhost', 'http')).toBe('http://localhost/*');
  });
});

describe('isSensitiveDomain', () => {
  it('matches an exact known sensitive domain', () => {
    expect(isSensitiveDomain('chase.com')).toEqual({
      sensitive: true,
      category: 'banking',
      matched: 'chase.com',
    });
  });

  it('matches a subdomain via suffix', () => {
    expect(isSensitiveDomain('online.chase.com')).toMatchObject({
      sensitive: true,
      matched: 'chase.com',
    });
    expect(isSensitiveDomain('us.etrade.com')).toMatchObject({
      sensitive: true,
      category: 'brokerage',
    });
  });

  it('does NOT match unrelated domains with similar prefixes', () => {
    expect(isSensitiveDomain('chasers.com')).toEqual({ sensitive: false });
    expect(isSensitiveDomain('etrade-fake.com')).toEqual({ sensitive: false });
  });

  it('matches across all categories', () => {
    expect(isSensitiveDomain('paypal.com').sensitive).toBe(true);
    expect(isSensitiveDomain('irs.gov').sensitive).toBe(true);
    expect(isSensitiveDomain('mychart.com').sensitive).toBe(true);
    expect(isSensitiveDomain('turbotax.com').sensitive).toBe(true);
  });

  it('returns sensitive: false for ordinary domains', () => {
    expect(isSensitiveDomain('example.com')).toEqual({ sensitive: false });
    expect(isSensitiveDomain('wikipedia.org')).toEqual({ sensitive: false });
    expect(isSensitiveDomain('localhost')).toEqual({ sensitive: false });
  });

  it('is case-insensitive', () => {
    expect(isSensitiveDomain('CHASE.com').sensitive).toBe(true);
    expect(isSensitiveDomain('Online.Chase.Com').sensitive).toBe(true);
  });

  it('strips trailing dot', () => {
    expect(isSensitiveDomain('chase.com.').sensitive).toBe(true);
  });
});

describe('listSensitiveDomains', () => {
  it('returns a non-empty list', () => {
    const list = listSensitiveDomains();
    expect(list.length).toBeGreaterThan(10);
  });

  it('every entry has a non-empty suffix and a known category', () => {
    const validCategories = new Set([
      'banking',
      'brokerage',
      'payment',
      'health',
      'government',
      'tax',
    ]);
    for (const entry of listSensitiveDomains()) {
      expect(entry.suffix.length).toBeGreaterThan(0);
      expect(validCategories.has(entry.category)).toBe(true);
    }
  });
});
