import { describe, expect, it, beforeEach } from 'vitest';
import { detectNoAi } from '@/content/extract/noai';

function setHead(html: string): void {
  document.head.innerHTML = html;
}

beforeEach(() => {
  document.head.innerHTML = '';
});

describe('detectNoAi', () => {
  it('returns null when no relevant meta tag is present', () => {
    setHead('<meta name="viewport" content="width=device-width" />');
    expect(detectNoAi(document)).toBeNull();
  });

  it('detects <meta name="robots" content="noai">', () => {
    setHead('<meta name="robots" content="noai" />');
    expect(detectNoAi(document)).toEqual({
      source: 'robots',
      content: 'noai',
      token: 'noai',
    });
  });

  it('detects noimageai', () => {
    setHead('<meta name="robots" content="noimageai" />');
    const result = detectNoAi(document);
    expect(result?.token).toBe('noimageai');
  });

  it('detects noai when mixed with other directives', () => {
    setHead('<meta name="robots" content="noindex, nofollow, noai" />');
    expect(detectNoAi(document)?.token).toBe('noai');
  });

  it('respects googlebot + bingbot sources', () => {
    setHead('<meta name="googlebot" content="noai">');
    expect(detectNoAi(document)?.source).toBe('googlebot');

    document.head.innerHTML = '<meta name="bingbot" content="noai">';
    expect(detectNoAi(document)?.source).toBe('bingbot');
  });

  it('matches the meta name case-insensitively', () => {
    setHead('<meta name="ROBOTS" content="NoAI">');
    expect(detectNoAi(document)?.token).toBe('noai');
  });

  it('ignores other robots directives', () => {
    setHead('<meta name="robots" content="noindex, nofollow, nosnippet">');
    expect(detectNoAi(document)).toBeNull();
  });

  it('ignores an empty content attribute', () => {
    setHead('<meta name="robots" content="">');
    expect(detectNoAi(document)).toBeNull();
  });

  it('returns the first matching tag when multiple are present', () => {
    setHead(
      '<meta name="bingbot" content="noai">' +
        '<meta name="robots" content="noai">'
    );
    const result = detectNoAi(document);
    // robots is checked first per HONORED_NAMES order.
    expect(result?.source).toBe('robots');
  });

  it('tolerates whitespace-only tokens', () => {
    setHead('<meta name="robots" content="  noai  ">');
    expect(detectNoAi(document)?.token).toBe('noai');
  });
});
