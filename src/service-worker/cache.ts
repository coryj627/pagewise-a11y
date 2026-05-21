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
 * Per-tab cache of the most recent extraction. Lives in the service
 * worker's memory; cleared when the tab navigates or closes. A persistent
 * chrome.storage.session-backed cache lands in Phase 2 once we have real
 * extraction latency to optimize.
 */
const cache = new Map<number, CachedExtract>();

export function setCache(
  tabId: number,
  value: Omit<CachedExtract, 'cachedAt'>
): void {
  cache.set(tabId, { ...value, cachedAt: Date.now() });
}

export function getCache(tabId: number): CachedExtract | undefined {
  return cache.get(tabId);
}

export function clearCache(tabId: number): void {
  cache.delete(tabId);
}

export function clearAllCache(): void {
  cache.clear();
}

/** For tests only. */
export function _cacheSize(): number {
  return cache.size;
}
