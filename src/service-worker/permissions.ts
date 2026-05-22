import { ChromeStorageBackend } from '@/shared/storage';
import { ChromePermissionsApi } from '@/shared/permissions';
import { DomainStore } from '@/shared/domain-store';
import {
  registerForPattern,
  unregisterForPattern,
  reconcileRegistrations,
  type ScriptingApi,
} from './content-scripts';

/**
 * Wire permission changes so the stored allowlist, the browser's actual
 * permissions, AND the registered content scripts all stay in sync.
 *
 * Three sources of truth must agree:
 *   - chrome.storage.local (the user-visible allowlist)
 *   - chrome.permissions    (what Chrome will grant the extension)
 *   - chrome.scripting       (which origins the content script registers for)
 *
 * Users can grant/revoke permissions outside the options page via
 * chrome://extensions; this module listens for those events and adjusts
 * the other two sources accordingly.
 *
 * Returns the {@link DomainStore} instance for callers that want to use it
 * for additional work.
 */
export function wirePermissions(): DomainStore {
  const store = new DomainStore(
    new ChromeStorageBackend(chrome.storage.local),
    new ChromePermissionsApi()
  );
  const scripting = chrome.scripting as unknown as ScriptingApi;

  chrome.permissions.onAdded.addListener((perms) => {
    const origins = perms.origins ?? [];
    if (origins.length === 0) return;
    void store.syncWithPermissions();
    for (const origin of origins) {
      void registerForPattern(scripting, origin).catch((error: unknown) => {
        console.error(
          `[pagewise] failed to register content script for ${origin}`,
          error
        );
      });
    }
  });

  chrome.permissions.onRemoved.addListener((perms) => {
    const origins = perms.origins ?? [];
    if (origins.length === 0) return;
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
    for (const origin of origins) {
      void unregisterForPattern(scripting, origin).catch((error: unknown) => {
        console.error(
          `[pagewise] failed to unregister content script for ${origin}`,
          error
        );
      });
    }
  });

  return store;
}

/**
 * Reconcile registered content scripts with the currently-granted
 * origins. Called on install + onStartup so the registrations survive
 * service worker recycling.
 */
export async function reconcileContentScripts(): Promise<void> {
  const scripting = chrome.scripting as unknown as ScriptingApi;
  const all = await chrome.permissions.getAll();
  const origins = all.origins ?? [];
  // Filter to the http(s) origins our content script targets — exclude
  // the api.anthropic.com permission which is not a content-script target.
  const userOrigins = origins.filter(
    (o) => o !== 'https://api.anthropic.com/*'
  );
  const { added, removed } = await reconcileRegistrations(scripting, userOrigins);
  if (added.length > 0 || removed.length > 0) {
    console.info(
      `[pagewise] content scripts reconciled — added ${added.length}, removed ${removed.length}`
    );
  }
}
