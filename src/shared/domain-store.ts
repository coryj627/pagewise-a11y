import {
  normalizeDomain,
  buildOriginPattern,
  isSensitiveDomain,
  type SensitiveCategory,
} from './domains';
import type { StorageBackend } from './storage';
import type { PermissionsApi } from './permissions';

const STORAGE_KEY = 'enabled_domains';

export type EnableOptions = {
  /** Set true after the user explicitly confirmed enabling a sensitive domain. */
  confirmSensitive?: boolean;
};

export type EnableResult =
  | { kind: 'enabled'; host: string }
  | { kind: 'already_enabled'; host: string }
  | {
      kind: 'invalid_domain';
      reason: 'empty' | 'malformed' | 'not_a_hostname' | 'privileged_scheme';
    }
  | {
      kind: 'sensitive_confirmation_required';
      host: string;
      category: SensitiveCategory;
      matched: string;
    }
  | { kind: 'permission_denied'; host: string }
  | { kind: 'permission_request_failed'; host: string };

export type DisableResult =
  | { kind: 'disabled'; host: string }
  | { kind: 'not_enabled'; host: string }
  | {
      kind: 'invalid_domain';
      reason: 'empty' | 'malformed' | 'not_a_hostname' | 'privileged_scheme';
    };

/**
 * Single source of truth for "which domains is Pagewise allowed to run on?"
 * Keeps storage and the browser's permission state in sync. See
 * architecture.md §6 ("extraction is domain opt-in") and §10.4.
 *
 * Two persistence layers are involved:
 *   - chrome.storage.local — the user-visible list shown in the options
 *     page and used by the side panel when deciding whether to extract.
 *   - chrome.permissions — what the browser actually grants. Required to
 *     inject the content script on a domain.
 *
 * They can drift if the user revokes permission in chrome://extensions or
 * if a previous Pagewise version stored a permission that's since been
 * cleared. {@link syncWithPermissions} reconciles them on startup.
 */
export class DomainStore {
  constructor(
    private readonly storage: StorageBackend,
    private readonly permissions: PermissionsApi
  ) {}

  async getEnabledDomains(): Promise<string[]> {
    const raw = await this.storage.get<unknown>(STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === 'string').sort();
  }

  async isEnabled(host: string): Promise<boolean> {
    const list = await this.getEnabledDomains();
    return list.includes(host);
  }

  async enable(input: string, options: EnableOptions = {}): Promise<EnableResult> {
    const normalized = normalizeDomain(input);
    if (normalized.kind === 'invalid') {
      return { kind: 'invalid_domain', reason: normalized.reason };
    }
    const host = normalized.host;

    if (await this.isEnabled(host)) {
      return { kind: 'already_enabled', host };
    }

    const sensitivity = isSensitiveDomain(host);
    if (sensitivity.sensitive && options.confirmSensitive !== true) {
      return {
        kind: 'sensitive_confirmation_required',
        host,
        category: sensitivity.category,
        matched: sensitivity.matched,
      };
    }

    const pattern = buildOriginPattern(host);
    let granted: boolean;
    try {
      granted = await this.permissions.request([pattern]);
    } catch {
      return { kind: 'permission_request_failed', host };
    }
    if (!granted) return { kind: 'permission_denied', host };

    const list = await this.getEnabledDomains();
    if (!list.includes(host)) {
      list.push(host);
      list.sort();
      await this.storage.set(STORAGE_KEY, list);
    }

    return { kind: 'enabled', host };
  }

  async disable(input: string): Promise<DisableResult> {
    const normalized = normalizeDomain(input);
    if (normalized.kind === 'invalid') {
      return { kind: 'invalid_domain', reason: normalized.reason };
    }
    const host = normalized.host;

    const list = await this.getEnabledDomains();
    if (!list.includes(host)) {
      // Still try to revoke permission in case storage and permissions drifted.
      await this.permissions.remove([buildOriginPattern(host)]).catch(() => false);
      return { kind: 'not_enabled', host };
    }

    await this.permissions.remove([buildOriginPattern(host)]).catch(() => false);
    const next = list.filter((h) => h !== host);
    await this.storage.set(STORAGE_KEY, next);
    return { kind: 'disabled', host };
  }

  /**
   * Reconcile the stored allowlist with chrome.permissions:
   *   - Drop stored hosts whose permission has been revoked externally.
   *   - Storage is authoritative for "user intent"; we never silently grant
   *     a permission that isn't already in chrome.permissions.
   *
   * Returns the count of hosts that were pruned so the service worker can
   * log the reconciliation.
   */
  async syncWithPermissions(): Promise<{ pruned: string[] }> {
    const granted = await this.permissions.getAllOrigins();
    const grantedSet = new Set(granted);

    const stored = await this.getEnabledDomains();
    const pruned: string[] = [];
    const kept: string[] = [];
    for (const host of stored) {
      if (grantedSet.has(buildOriginPattern(host))) {
        kept.push(host);
      } else {
        pruned.push(host);
      }
    }

    if (pruned.length > 0) {
      await this.storage.set(STORAGE_KEY, kept);
    }
    return { pruned };
  }
}
