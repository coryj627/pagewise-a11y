/**
 * Restrict chrome.storage.local to TRUSTED_CONTEXTS so the content script
 * (which runs in an isolated world but is reachable from page-injected code
 * paths) cannot read the user's API key. See architecture.md §10.1.
 */
export async function configureStorageAccessLevel(): Promise<void> {
  try {
    await chrome.storage.local.setAccessLevel({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  } catch (error: unknown) {
    console.error('[pagewise] failed to set storage access level', error);
  }
}
