/**
 * Thin async key-value abstraction over chrome.storage so consumers
 * (DomainStore, options UI, future cost ledger) can be unit-tested in
 * jsdom without a real chrome global.
 */
export interface StorageBackend {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Production implementation backed by `chrome.storage.local` (default) or
 * any other `chrome.storage.StorageArea` (e.g., session). The service
 * worker is responsible for configuring the area to TRUSTED_CONTEXTS
 * access level — see service-worker/access-level.ts.
 */
export class ChromeStorageBackend implements StorageBackend {
  constructor(private readonly area: chrome.storage.StorageArea) {}

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const result = await this.area.get(key);
    return (result[key] ?? undefined) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.area.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await this.area.remove(key);
  }
}

/**
 * In-memory backend used by tests and by short-lived contexts. Not
 * persisted; not synchronized across surfaces.
 */
export class MemoryStorageBackend implements StorageBackend {
  private readonly map = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.map.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }

  /** Test helper: clear everything. Not part of the production interface. */
  clear(): void {
    this.map.clear();
  }
}
