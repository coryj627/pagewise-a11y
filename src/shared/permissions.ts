/**
 * Async wrapper over `chrome.permissions` so the domain store can be tested
 * in jsdom. Only the `origins` permission shape is supported — Pagewise
 * never requests new `permissions` (API permissions) at runtime; those are
 * declared statically in the manifest.
 */
export interface PermissionsApi {
  /** Are all of these origin patterns currently granted? */
  contains(origins: string[]): Promise<boolean>;
  /** Request the user to grant these origin patterns. Returns true on grant. */
  request(origins: string[]): Promise<boolean>;
  /** Revoke these origin patterns. Returns true on success. */
  remove(origins: string[]): Promise<boolean>;
  /** List all currently-granted origin patterns. */
  getAllOrigins(): Promise<string[]>;
}

/**
 * Production implementation. `chrome.permissions.request` requires a user
 * gesture (a click). Callers must invoke it from a UI event handler.
 */
export class ChromePermissionsApi implements PermissionsApi {
  async contains(origins: string[]): Promise<boolean> {
    return chrome.permissions.contains({ origins });
  }

  async request(origins: string[]): Promise<boolean> {
    return chrome.permissions.request({ origins });
  }

  async remove(origins: string[]): Promise<boolean> {
    return chrome.permissions.remove({ origins });
  }

  async getAllOrigins(): Promise<string[]> {
    const all = await chrome.permissions.getAll();
    return all.origins ?? [];
  }
}

/**
 * In-memory test implementation. `request` always succeeds and grants
 * immediately (no consent UI); tests that want to simulate user refusal
 * can pass `{ autoApprove: false }`.
 */
export class MemoryPermissionsApi implements PermissionsApi {
  private readonly granted = new Set<string>();
  private autoApprove: boolean;

  constructor(options: { autoApprove?: boolean } = {}) {
    this.autoApprove = options.autoApprove ?? true;
  }

  async contains(origins: string[]): Promise<boolean> {
    return origins.every((o) => this.granted.has(o));
  }

  async request(origins: string[]): Promise<boolean> {
    if (!this.autoApprove) return false;
    for (const o of origins) this.granted.add(o);
    return true;
  }

  async remove(origins: string[]): Promise<boolean> {
    for (const o of origins) this.granted.delete(o);
    return true;
  }

  async getAllOrigins(): Promise<string[]> {
    return Array.from(this.granted);
  }

  /** Test helpers — not part of the production interface. */
  setAutoApprove(value: boolean): void {
    this.autoApprove = value;
  }
  primeGranted(origins: string[]): void {
    for (const o of origins) this.granted.add(o);
  }
  clear(): void {
    this.granted.clear();
  }
}
