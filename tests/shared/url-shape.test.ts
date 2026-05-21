import { describe, expect, it } from 'vitest';
import { redactUrlPath } from '@/shared/url-shape';

describe('redactUrlPath', () => {
  it('replaces UUIDs with :id', () => {
    expect(redactUrlPath('/orders/8c4f1234-5678-4abc-9def-0123456789ab/items')).toBe(
      '/orders/:id/items'
    );
  });

  it('replaces UUIDs case-insensitively', () => {
    expect(redactUrlPath('/x/8C4F1234-5678-4ABC-9DEF-0123456789AB')).toBe('/x/:id');
  });

  it('replaces long hex IDs', () => {
    expect(redactUrlPath('/users/5f8a7b3c4d2e1f0a9b8c7d6e')).toBe('/users/:id');
  });

  it('replaces long numeric IDs', () => {
    expect(redactUrlPath('/users/12345678')).toBe('/users/:id');
    expect(redactUrlPath('/users/123456789012')).toBe('/users/:id');
  });

  it('replaces JWT-like prefixes', () => {
    expect(
      redactUrlPath('/api/data/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
    ).toBe('/api/data/:id');
  });

  it('leaves human-readable slugs alone', () => {
    expect(redactUrlPath('/articles/the-best-coffee-shops')).toBe(
      '/articles/the-best-coffee-shops'
    );
    expect(redactUrlPath('/blog/2026/01/announcement')).toBe(
      '/blog/2026/01/announcement'
    );
  });

  it('preserves short numeric segments (these are usually meaningful)', () => {
    expect(redactUrlPath('/blog/2026/01')).toBe('/blog/2026/01');
    expect(redactUrlPath('/p/1234')).toBe('/p/1234');
  });

  it('handles root and empty paths', () => {
    expect(redactUrlPath('/')).toBe('/');
    expect(redactUrlPath('')).toBe('');
  });

  it('handles multiple replaceable segments', () => {
    expect(
      redactUrlPath('/users/12345678/orders/8c4f1234-5678-4abc-9def-0123456789ab')
    ).toBe('/users/:id/orders/:id');
  });

  it('keeps trailing slash semantics', () => {
    expect(redactUrlPath('/users/12345678/')).toBe('/users/:id/');
  });
});
