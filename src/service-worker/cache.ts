import type { PageModel } from '@/schemas/page-model';
import type { PageCapabilityReport } from '@/schemas/capability-report';
import type { SensitivityReport } from '@/schemas/sensitivity-report';

export interface CachedExtract {
  model: PageModel;
  capability: PageCapabilityReport;
  sensitivity: SensitivityReport;
  cachedAt: number;
}

/**
 * Per-tab cache of the most recent extraction. LRU + capped at
 * MAX_CACHED_TABS so a power user with many open tabs doesn't grow the
 * cache unboundedly. A persistent chrome.storage.session-backed cache
 * lands in Phase 2 once we have real extraction latency to optimize.
 *
 * Recency uses Map insertion order: setCache and getCache both move
 * the entry to the end. The first key in the map is therefore always
 * the least-recently-accessed.
 */
export const MAX_CACHED_TABS = 20;

const cache = new Map<number, CachedExtract>();

export function setCache(
  tabId: number,
  value: Omit<CachedExtract, 'cachedAt'>
): void {
  // Delete first so re-setting puts the entry at the end (most recent).
  cache.delete(tabId);
  cache.set(tabId, { ...value, cachedAt: Date.now() });
  evictUntilUnderCap();
}

export function getCache(tabId: number): CachedExtract | undefined {
  const entry = cache.get(tabId);
  if (entry === undefined) return undefined;
  // Bump: re-insert at the end.
  cache.delete(tabId);
  cache.set(tabId, entry);
  return entry;
}

export function clearCache(tabId: number): void {
  cache.delete(tabId);
}

export function clearAllCache(): void {
  cache.clear();
}

function evictUntilUnderCap(): void {
  while (cache.size > MAX_CACHED_TABS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// ─────────────────────────────────────────────────────────
// Test-only helpers (not part of the production API).
// ─────────────────────────────────────────────────────────

export function _cacheSize(): number {
  return cache.size;
}

export function _cacheKeys(): number[] {
  return Array.from(cache.keys());
}
