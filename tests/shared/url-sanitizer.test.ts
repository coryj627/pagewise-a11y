import { describe, expect, it } from 'vitest';
import { sanitizeUrl } from '@shared/url-sanitizer';

describe('sanitizeUrl', () => {
  describe('allowed schemes', () => {
    it('accepts https URLs by default', () => {
      const result = sanitizeUrl('https://example.com/path?q=1');
      expect(result).toMatchObject({
        kind: 'allowed',
        scheme: 'https',
        origin: 'https://example.com',
      });
    });

    it('accepts http URLs by default', () => {
      const result = sanitizeUrl('http://example.com/');
      expect(result).toMatchObject({ kind: 'allowed', scheme: 'http' });
    });

    it('preserves the full href including query and fragment', () => {
      const result = sanitizeUrl('https://example.com/x?a=1&b=2#frag');
      expect(result).toMatchObject({
        kind: 'allowed',
        href: 'https://example.com/x?a=1&b=2#frag',
      });
    });

    it('handles IDN hosts via the URL parser', () => {
      const result = sanitizeUrl('https://bücher.example.com/');
      expect(result.kind).toBe('allowed');
      if (result.kind === 'allowed') {
        expect(result.origin).toContain('xn--bcher-kva');
      }
    });
  });

  describe('dangerous schemes (always blocked)', () => {
    it.each([
      ['javascript:alert(1)', 'dangerous_scheme'],
      ['JAVASCRIPT:alert(1)', 'dangerous_scheme'],
      ['JaVaScRiPt:alert(1)', 'dangerous_scheme'],
      ['data:text/html,<script>alert(1)</script>', 'dangerous_scheme'],
      ['vbscript:msgbox', 'dangerous_scheme'],
      ['blob:https://example.com/uuid', 'dangerous_scheme'],
      ['file:///etc/passwd', 'dangerous_scheme'],
      ['about:blank', 'dangerous_scheme'],
      ['chrome://settings', 'dangerous_scheme'],
      ['chrome-extension://abcd/page.html', 'dangerous_scheme'],
      ['view-source:https://example.com', 'dangerous_scheme'],
    ])('blocks %s', (input, reason) => {
      expect(sanitizeUrl(input)).toEqual({ kind: 'blocked', reason });
    });

    it('blocks javascript: with whitespace around it', () => {
      expect(sanitizeUrl('   javascript:alert(1)')).toEqual({
        kind: 'blocked',
        reason: 'dangerous_scheme',
      });
    });

    it('blocks javascript: even with embedded control chars in scheme', () => {
      // WHATWG URL parser strips tabs/newlines from the scheme during
      // parsing, so `java\nscript:alert(1)` normalizes to `javascript:...`.
      expect(sanitizeUrl('java\nscript:alert(1)')).toEqual({
        kind: 'blocked',
        reason: 'dangerous_scheme',
      });
      expect(sanitizeUrl('java\tscript:alert(1)')).toEqual({
        kind: 'blocked',
        reason: 'dangerous_scheme',
      });
    });

    it('blocks dangerous schemes even when caller mistakenly allow-lists them', () => {
      const result = sanitizeUrl('javascript:alert(1)', {
        allowSchemes: ['http', 'https', 'javascript' as never],
      });
      expect(result).toEqual({ kind: 'blocked', reason: 'dangerous_scheme' });
    });
  });

  describe('disallowed schemes (context-dependent)', () => {
    it('blocks mailto: by default', () => {
      expect(sanitizeUrl('mailto:user@example.com')).toEqual({
        kind: 'blocked',
        reason: 'disallowed_scheme',
      });
    });

    it('blocks tel: by default', () => {
      expect(sanitizeUrl('tel:+15551234567')).toEqual({
        kind: 'blocked',
        reason: 'disallowed_scheme',
      });
    });

    it('allows mailto: when the caller opts in', () => {
      const result = sanitizeUrl('mailto:user@example.com', {
        allowSchemes: ['http', 'https', 'mailto'],
      });
      expect(result).toMatchObject({ kind: 'allowed', scheme: 'mailto' });
    });

    it('allows tel: when the caller opts in', () => {
      const result = sanitizeUrl('tel:+15551234567', {
        allowSchemes: ['http', 'https', 'tel'],
      });
      expect(result).toMatchObject({ kind: 'allowed', scheme: 'tel' });
    });

    it('blocks ftp:// even though it parses cleanly', () => {
      expect(sanitizeUrl('ftp://example.com/')).toEqual({
        kind: 'blocked',
        reason: 'disallowed_scheme',
      });
    });
  });

  describe('malformed inputs', () => {
    it('blocks empty string', () => {
      expect(sanitizeUrl('')).toEqual({ kind: 'blocked', reason: 'empty' });
    });

    it('blocks whitespace-only string', () => {
      expect(sanitizeUrl('   \t\n  ')).toEqual({ kind: 'blocked', reason: 'empty' });
    });

    it.each([null, undefined, 42, {}, [], true])(
      'blocks non-string input (%p)',
      (input) => {
        expect(sanitizeUrl(input)).toEqual({ kind: 'blocked', reason: 'malformed' });
      }
    );

    it('blocks bare identifiers as not_absolute', () => {
      expect(sanitizeUrl('foo')).toEqual({ kind: 'blocked', reason: 'not_absolute' });
      expect(sanitizeUrl('example.com')).toEqual({
        kind: 'blocked',
        reason: 'not_absolute',
      });
    });

    it('blocks relative URLs as not_absolute', () => {
      expect(sanitizeUrl('/path/to/page')).toEqual({
        kind: 'blocked',
        reason: 'not_absolute',
      });
      expect(sanitizeUrl('../page')).toEqual({
        kind: 'blocked',
        reason: 'not_absolute',
      });
    });

    it('blocks fragment-only URLs as not_absolute', () => {
      expect(sanitizeUrl('#section')).toEqual({
        kind: 'blocked',
        reason: 'not_absolute',
      });
    });

    it('blocks protocol-relative URLs as not_absolute', () => {
      expect(sanitizeUrl('//evil.example.com/path')).toEqual({
        kind: 'blocked',
        reason: 'not_absolute',
      });
    });
  });

  describe('isExternal flagging', () => {
    it('marks URLs as external when pageOrigin is omitted', () => {
      const result = sanitizeUrl('https://example.com/');
      expect(result.kind === 'allowed' && result.isExternal).toBe(true);
    });

    it('marks same-origin URLs as internal', () => {
      const result = sanitizeUrl('https://example.com/page', {
        pageOrigin: 'https://example.com',
      });
      expect(result.kind === 'allowed' && result.isExternal).toBe(false);
    });

    it('marks cross-origin URLs as external', () => {
      const result = sanitizeUrl('https://other.example.com/page', {
        pageOrigin: 'https://example.com',
      });
      expect(result.kind === 'allowed' && result.isExternal).toBe(true);
    });

    it('treats different schemes on the same host as external', () => {
      const result = sanitizeUrl('http://example.com/', {
        pageOrigin: 'https://example.com',
      });
      expect(result.kind === 'allowed' && result.isExternal).toBe(true);
    });
  });
});
