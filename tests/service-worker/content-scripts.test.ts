import { describe, expect, it, beforeEach } from 'vitest';
import {
  scriptIdForPattern,
  isPagewiseScriptId,
  registerForPattern,
  unregisterForPattern,
  reconcileRegistrations,
  type RegisteredContentScriptDescriptor,
  type ScriptingApi,
} from '@/service-worker/content-scripts';

class MemoryScriptingApi implements ScriptingApi {
  private byId = new Map<string, RegisteredContentScriptDescriptor>();

  async registerContentScripts(
    scripts: ReadonlyArray<RegisteredContentScriptDescriptor>
  ): Promise<void> {
    for (const s of scripts) {
      if (this.byId.has(s.id)) {
        throw new Error(`script with id ${s.id} already registered`);
      }
      this.byId.set(s.id, s);
    }
  }

  async unregisterContentScripts(filter: { ids: string[] }): Promise<void> {
    for (const id of filter.ids) {
      if (!this.byId.has(id)) throw new Error(`no script with id ${id}`);
      this.byId.delete(id);
    }
  }

  async getRegisteredContentScripts(): Promise<
    ReadonlyArray<RegisteredContentScriptDescriptor>
  > {
    return Array.from(this.byId.values());
  }

  size(): number {
    return this.byId.size;
  }

  primeWith(descriptors: ReadonlyArray<RegisteredContentScriptDescriptor>): void {
    for (const d of descriptors) this.byId.set(d.id, d);
  }
}

describe('scriptIdForPattern', () => {
  it('derives a readable id from a normal https pattern', () => {
    expect(scriptIdForPattern('https://example.com/*')).toBe(
      'pagewise-cs-example.com'
    );
  });

  it('preserves subdomain in the id', () => {
    expect(scriptIdForPattern('https://news.example.com/*')).toBe(
      'pagewise-cs-news.example.com'
    );
  });

  it('replaces wildcard characters with hyphens', () => {
    expect(scriptIdForPattern('https://*.example.com/*')).toBe(
      'pagewise-cs--.example.com'
    );
  });

  it('handles http: pattern', () => {
    expect(scriptIdForPattern('http://localhost/*')).toBe(
      'pagewise-cs-localhost'
    );
  });

  it('is deterministic — same input, same id', () => {
    expect(scriptIdForPattern('https://example.com/*')).toBe(
      scriptIdForPattern('https://example.com/*')
    );
  });
});

describe('isPagewiseScriptId', () => {
  it('matches ids produced by the helper', () => {
    expect(isPagewiseScriptId(scriptIdForPattern('https://example.com/*'))).toBe(
      true
    );
  });
  it('rejects ids from other extensions', () => {
    expect(isPagewiseScriptId('other-extension-cs-example.com')).toBe(false);
  });
});

describe('registerForPattern', () => {
  let api: MemoryScriptingApi;
  beforeEach(() => {
    api = new MemoryScriptingApi();
  });

  it('registers a script for the given origin pattern', async () => {
    await registerForPattern(api, 'https://example.com/*');
    const all = await api.getRegisteredContentScripts();
    expect(all).toHaveLength(1);
    expect(all[0]?.matches).toEqual(['https://example.com/*']);
    expect(all[0]?.js).toEqual(['content-script.js']);
    expect(all[0]?.runAt).toBe('document_idle');
    expect(all[0]?.persistAcrossSessions).toBe(true);
  });

  it('is idempotent — registering the same pattern twice keeps a single script', async () => {
    await registerForPattern(api, 'https://example.com/*');
    await registerForPattern(api, 'https://example.com/*');
    expect(api.size()).toBe(1);
  });
});

describe('unregisterForPattern', () => {
  it('removes the script for a given pattern', async () => {
    const api = new MemoryScriptingApi();
    await registerForPattern(api, 'https://example.com/*');
    await unregisterForPattern(api, 'https://example.com/*');
    expect(api.size()).toBe(0);
  });

  it('silently no-ops if the pattern was never registered', async () => {
    const api = new MemoryScriptingApi();
    await expect(
      unregisterForPattern(api, 'https://gone.example/*')
    ).resolves.toBeUndefined();
  });
});

describe('reconcileRegistrations', () => {
  let api: MemoryScriptingApi;
  beforeEach(() => {
    api = new MemoryScriptingApi();
  });

  it('adds scripts for newly-granted origins from an empty state', async () => {
    const result = await reconcileRegistrations(api, [
      'https://a.example/*',
      'https://b.example/*',
    ]);
    expect(result.added).toEqual(
      expect.arrayContaining(['https://a.example/*', 'https://b.example/*'])
    );
    expect(result.removed).toEqual([]);
    expect(api.size()).toBe(2);
  });

  it('removes Pagewise scripts whose origin is no longer granted', async () => {
    await registerForPattern(api, 'https://a.example/*');
    await registerForPattern(api, 'https://b.example/*');

    const result = await reconcileRegistrations(api, ['https://a.example/*']);
    expect(result.removed).toEqual(['pagewise-cs-b.example']);
    expect(result.added).toEqual([]);

    const remaining = await api.getRegisteredContentScripts();
    expect(remaining.map((s) => s.matches[0])).toEqual(['https://a.example/*']);
  });

  it('does nothing when storage and registrations already agree', async () => {
    await registerForPattern(api, 'https://a.example/*');
    const result = await reconcileRegistrations(api, ['https://a.example/*']);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(api.size()).toBe(1);
  });

  it('leaves scripts owned by other extensions alone', async () => {
    api.primeWith([
      {
        id: 'other-extension-script',
        matches: ['https://elsewhere.example/*'],
        js: ['other.js'],
        runAt: 'document_idle',
        allFrames: false,
        persistAcrossSessions: true,
      },
    ]);
    await reconcileRegistrations(api, ['https://a.example/*']);
    const all = await api.getRegisteredContentScripts();
    const ids = all.map((s) => s.id);
    expect(ids).toContain('other-extension-script');
    expect(ids).toContain('pagewise-cs-a.example');
  });

  it('handles an empty granted list by removing all Pagewise scripts', async () => {
    await registerForPattern(api, 'https://a.example/*');
    await registerForPattern(api, 'https://b.example/*');
    const result = await reconcileRegistrations(api, []);
    expect(result.removed.length).toBe(2);
    expect(api.size()).toBe(0);
  });
});
