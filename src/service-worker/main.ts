import { configureStorageAccessLevel } from './access-level';
import { wirePermissions } from './permissions';

// Subscriptions must be attached at the top level so they re-register
// every time the service worker wakes up — MV3 terminates idle workers
// and re-runs this module on the next event.
const domainStore = wirePermissions();

chrome.runtime.onInstalled.addListener(() => {
  void configureStorageAccessLevel();
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => {
      console.error('[pagewise] failed to set side panel behavior', error);
    });
  void domainStore.syncWithPermissions().catch((error: unknown) => {
    console.error('[pagewise] startup sync failed', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  void domainStore.syncWithPermissions().catch((error: unknown) => {
    console.error('[pagewise] onStartup sync failed', error);
  });
});
