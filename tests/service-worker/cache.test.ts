import { describe, expect, it, beforeEach } from 'vitest';
import {
  setCache,
  getCache,
  clearCache,
  clearAllCache,
  _cacheSize,
  _cacheKeys,
  MAX_CACHED_TABS,
  type CachedExtract,
} from '@/service-worker/cache';
import type { PageModel } from '@/schemas/page-model';
import type { PageCapabilityReport } from '@/schemas/capability-report';
import type { SensitivityReport } from '@/schemas/sensitivity-report';

const EXTRACTION = '11111111-1111-4111-8111-111111111111';

function makeValue(): Omit<CachedExtract, 'cachedAt'> {
  const model: PageModel = {
    schema_version: 2,
    extraction_id: EXTRACTION,
    url_origin: 'https://example.com',
    url_path_shape: '/',
    title: 'Test',
    extracted_at: '2026-05-22T00:00:00.000Z',
    content_hash: 'h',
    page_state: 'normal',
    landmarks: [],
    main_content: {
      ref: {
        id: 'n_main',
        extraction_id: EXTRACTION,
        frame_ref: 'top',
        selector_hints: {},
        hashes: { role: 'main' },
      },
      tag: 'main',
      role: 'main',
      role_source: 'native',
      children: [],
    },
    interaction_surface: { forms: [], primary_buttons: [], search_inputs: [] },
    deterministic_candidates: [],
  };
  const capability: PageCapabilityReport = {
    extraction_quality: 'good',
    reasons: [],
    counts: {
      text_nodes: 0,
      headings: 0,
      landmarks: 0,
      links: 0,
      buttons: 0,
      form_controls: 0,
      images_without_alt: 0,
      frames_accessible: 0,
      frames_inaccessible: 0,
    },
  };
  const sensitivity: SensitivityReport = {
    page_classification: 'public_likely',
    redactions: [],
    url_path_redacted: false,
  };
  return { model, capability, sensitivity };
}

describe('per-tab PageModel cache', () => {
  beforeEach(() => {
    clearAllCache();
  });

  it('round-trips a single entry', () => {
    setCache(7, makeValue());
    const got = getCache(7);
    expect(got).toBeDefined();
    expect(got?.model.title).toBe('Test');
  });

  it('returns undefined for unknown tabs', () => {
    expect(getCache(99)).toBeUndefined();
  });

  it('clearCache removes only the requested tab', () => {
    setCache(1, makeValue());
    setCache(2, makeValue());
    clearCache(1);
    expect(getCache(1)).toBeUndefined();
    expect(getCache(2)).toBeDefined();
  });

  it('clearAllCache empties everything', () => {
    setCache(1, makeValue());
    setCache(2, makeValue());
    clearAllCache();
    expect(_cacheSize()).toBe(0);
  });

  it('caps total entries at MAX_CACHED_TABS via LRU eviction', () => {
    for (let i = 0; i < MAX_CACHED_TABS + 5; i++) {
      setCache(i, makeValue());
    }
    expect(_cacheSize()).toBe(MAX_CACHED_TABS);
    // The first 5 inserts should have been evicted.
    for (let i = 0; i < 5; i++) {
      expect(getCache(i)).toBeUndefined();
    }
    // The last MAX_CACHED_TABS remain.
    for (let i = 5; i < MAX_CACHED_TABS + 5; i++) {
      expect(getCache(i)).toBeDefined();
    }
  });

  it('getCache bumps the entry to most-recent so it survives eviction', () => {
    for (let i = 0; i < MAX_CACHED_TABS; i++) {
      setCache(i, makeValue());
    }
    // Bump tab 0 to most-recent.
    getCache(0);
    // Insert a fresh tab; this should evict the oldest, which is now 1.
    setCache(999, makeValue());
    expect(getCache(0)).toBeDefined();
    expect(getCache(1)).toBeUndefined();
  });

  it('setCache on an existing tab moves it to most-recent', () => {
    for (let i = 0; i < MAX_CACHED_TABS; i++) {
      setCache(i, makeValue());
    }
    // Re-set tab 0 → bumped to most-recent.
    setCache(0, makeValue());
    // Insert two new tabs; tabs 1 and 2 should be evicted, not 0.
    setCache(1001, makeValue());
    setCache(1002, makeValue());
    expect(getCache(0)).toBeDefined();
    expect(getCache(1)).toBeUndefined();
    expect(getCache(2)).toBeUndefined();
  });

  it('_cacheKeys reflects insertion / access order', () => {
    setCache(1, makeValue());
    setCache(2, makeValue());
    setCache(3, makeValue());
    expect(_cacheKeys()).toEqual([1, 2, 3]);
    getCache(1);
    expect(_cacheKeys()).toEqual([2, 3, 1]);
  });
});
