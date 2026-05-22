import { configureStorageAccessLevel } from './access-level';
import { wirePermissions, reconcileContentScripts } from './permissions';
import { installRouter } from './router';

// Subscriptions must be attached at the top level so they re-register
// every time the service worker wakes up — MV3 terminates idle workers
// and re-runs this module on the next event.
const domainStore = wirePermissions();
installRouter();

chrome.runtime.onInstalled.addListener((details) => {
  void configureStorageAccessLevel();
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => {
      console.error('[pagewise] failed to set side panel behavior', error);
    });
  void domainStore.syncWithPermissions().catch((error: unknown) => {
    console.error('[pagewise] startup sync failed', error);
  });
  void reconcileContentScripts().catch((error: unknown) => {
    console.error('[pagewise] content script reconcile failed', error);
  });

  // First-run onboarding: open the options page so the user can set
  // their API key and enable a domain. Only fires on fresh install —
  // updates and Chrome upgrades skip this so we don't surprise the
  // user every release.
  if (details.reason === 'install') {
    void chrome.runtime.openOptionsPage().catch((error: unknown) => {
      console.error('[pagewise] failed to open options on install', error);
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void domainStore.syncWithPermissions().catch((error: unknown) => {
    console.error('[pagewise] onStartup sync failed', error);
  });
  void reconcileContentScripts().catch((error: unknown) => {
    console.error('[pagewise] onStartup content script reconcile failed', error);
  });
});
