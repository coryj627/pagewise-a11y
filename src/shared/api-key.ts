import type { StorageBackend } from './storage';

const STORAGE_KEY = 'anthropic_api_key';

/**
 * Persists the user's Anthropic API key. The chrome.storage.local area
 * this is written to has its access level set to TRUSTED_CONTEXTS on
 * install (see service-worker/access-level.ts), so the key is reachable
 * from the side panel and options page but not from content scripts.
 *
 * See architecture.md §10.1.
 */
export class ApiKeyStore {
  constructor(private readonly storage: StorageBackend) {}

  async get(): Promise<string | null> {
    const value = await this.storage.get<unknown>(STORAGE_KEY);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  /**
   * Set the API key. Trims surrounding whitespace; rejects (no-op stores
   * nothing) if the trimmed value is empty.
   */
  async set(value: string): Promise<void> {
    const trimmed = value.trim();
    if (trimmed === '') {
      await this.clear();
      return;
    }
    await this.storage.set(STORAGE_KEY, trimmed);
  }

  async clear(): Promise<void> {
    await this.storage.remove(STORAGE_KEY);
  }

  async isSet(): Promise<boolean> {
    return (await this.get()) !== null;
  }

  /**
   * Render a key as "sk-…last4" for UI display. Returns "(not set)" when
   * no key is stored.
   */
  static mask(key: string | null): string {
    if (key === null || key.length < 6) return '(not set)';
    return `${key.slice(0, 5)}…${key.slice(-4)}`;
  }
}
