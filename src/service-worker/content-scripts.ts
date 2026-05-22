/**
 * Dynamic content-script registration. Replaces the static
 * `content_scripts` manifest entry: the content script is only registered
 * for origins the user has actually granted permission for, with no
 * misleading `<all_urls>` wildcard in the manifest. See architecture.md
 * §6 ("extraction is domain opt-in").
 *
 * The service worker subscribes to chrome.permissions events and to the
 * extension lifecycle so storage, permissions, and the active script
 * registrations stay in sync — even if the user revokes permission via
 * chrome://extensions.
 */

const CONTENT_SCRIPT_PATH = 'content-script.js';
const ID_PREFIX = 'pagewise-cs-';

export interface RegisteredContentScriptDescriptor {
  id: string;
  matches: string[];
  js: string[];
  runAt: 'document_start' | 'document_end' | 'document_idle';
  allFrames: boolean;
  persistAcrossSessions: boolean;
}

export interface ScriptingApi {
  registerContentScripts(
    scripts: ReadonlyArray<RegisteredContentScriptDescriptor>
  ): Promise<void>;
  unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
  getRegisteredContentScripts(): Promise<
    ReadonlyArray<RegisteredContentScriptDescriptor>
  >;
}

/**
 * Stable, human-readable id for an origin pattern. The hostname becomes
 * part of the id so service worker logs are easy to read; non-DNS-safe
 * characters get replaced. Wildcards (`*`) get replaced too — the wildcard
 * scheme pattern `https://*.example.com/*` becomes `pagewise-cs--.example.com`.
 */
export function scriptIdForPattern(pattern: string): string {
  const match = pattern.match(/^[a-z]+:\/\/([^/]+)/i);
  const host = match?.[1] ?? pattern;
  const safeHost = host.replace(/[^a-z0-9.-]/gi, '-');
  return `${ID_PREFIX}${safeHost}`;
}

export function isPagewiseScriptId(id: string): boolean {
  return id.startsWith(ID_PREFIX);
}

function descriptorFor(pattern: string): RegisteredContentScriptDescriptor {
  return {
    id: scriptIdForPattern(pattern),
    matches: [pattern],
    js: [CONTENT_SCRIPT_PATH],
    runAt: 'document_idle',
    allFrames: false,
    persistAcrossSessions: true,
  };
}

/**
 * Register the content script for a single origin pattern. Idempotent —
 * unregisters any previous registration under the same id before adding.
 */
export async function registerForPattern(
  api: ScriptingApi,
  pattern: string
): Promise<void> {
  const desc = descriptorFor(pattern);
  await api.unregisterContentScripts({ ids: [desc.id] }).catch(() => undefined);
  await api.registerContentScripts([desc]);
}

export async function unregisterForPattern(
  api: ScriptingApi,
  pattern: string
): Promise<void> {
  const id = scriptIdForPattern(pattern);
  await api.unregisterContentScripts({ ids: [id] }).catch(() => undefined);
}

/**
 * Reconcile the set of registered Pagewise content scripts with the
 * supplied list of currently-granted origin patterns. Removes
 * Pagewise-owned scripts whose pattern is no longer granted; adds
 * Pagewise-owned scripts for newly-granted patterns. Scripts not owned
 * by Pagewise (different id prefix) are left alone.
 *
 * Returns a structured summary so callers can log what changed.
 */
export async function reconcileRegistrations(
  api: ScriptingApi,
  grantedPatterns: ReadonlyArray<string>
): Promise<{ added: string[]; removed: string[] }> {
  const existing = await api.getRegisteredContentScripts();
  const ourExistingIds = new Set(
    existing.map((s) => s.id).filter(isPagewiseScriptId)
  );

  const wantedById = new Map<string, string>();
  for (const pattern of grantedPatterns) {
    wantedById.set(scriptIdForPattern(pattern), pattern);
  }

  const removeIds = Array.from(ourExistingIds).filter(
    (id) => !wantedById.has(id)
  );
  if (removeIds.length > 0) {
    await api.unregisterContentScripts({ ids: removeIds });
  }

  const addDescs: RegisteredContentScriptDescriptor[] = [];
  for (const [id, pattern] of wantedById.entries()) {
    if (!ourExistingIds.has(id)) addDescs.push(descriptorFor(pattern));
  }
  if (addDescs.length > 0) {
    await api.registerContentScripts(addDescs);
  }

  return {
    added: addDescs.map((d) => d.matches[0]!),
    removed: removeIds,
  };
}
