import { ChromeStorageBackend } from '@/shared/storage';
import { ChromePermissionsApi } from '@/shared/permissions';
import { DomainStore } from '@/shared/domain-store';

/**
 * Wire permission changes so the stored allowlist and the browser's actual
 * permissions stay in sync. Users can revoke permissions outside of the
 * options page via chrome://extensions; we listen for those events and
 * prune storage when they happen.
 *
 * Returns the {@link DomainStore} instance for callers that want to use it
 * for additional work (e.g., a future "open side panel on enabled tab"
 * decision).
 */
export function wirePermissions(): DomainStore {
  const store = new DomainStore(
    new ChromeStorageBackend(chrome.storage.local),
    new ChromePermissionsApi()
  );

  chrome.permissions.onAdded.addListener((perms) => {
    if (perms.origins === undefined || perms.origins.length === 0) return;
    void store.syncWithPermissions();
  });

  chrome.permissions.onRemoved.addListener((perms) => {
    if (perms.origins === undefined || perms.origins.length === 0) return;
    void store
      .syncWithPermissions()
      .then(({ pruned }) => {
        if (pruned.length > 0) {
          console.info(
            '[pagewise] pruned externally-revoked domains from storage:',
            pruned
          );
        }
      })
      .catch((error: unknown) => {
        console.error('[pagewise] syncWithPermissions failed', error);
      });
  });

  return store;
}
