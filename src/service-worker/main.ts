import { configureStorageAccessLevel } from './access-level';

chrome.runtime.onInstalled.addListener(() => {
  void configureStorageAccessLevel();
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => {
      console.error('[pagewise] failed to set side panel behavior', error);
    });
});
