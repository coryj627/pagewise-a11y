import { describe, expect, it, beforeEach } from 'vitest';
import { DomainStore } from '@/shared/domain-store';
import { MemoryStorageBackend } from '@/shared/storage';
import { MemoryPermissionsApi } from '@/shared/permissions';
import { buildOriginPattern } from '@/shared/domains';

function setup() {
  const storage = new MemoryStorageBackend();
  const permissions = new MemoryPermissionsApi();
  const store = new DomainStore(storage, permissions);
  return { storage, permissions, store };
}

describe('DomainStore — enable / isEnabled / getEnabledDomains', () => {
  let store: DomainStore;
  let permissions: MemoryPermissionsApi;
  beforeEach(() => {
    ({ store, permissions } = setup());
  });

  it('starts empty', async () => {
    expect(await store.getEnabledDomains()).toEqual([]);
    expect(await store.isEnabled('example.com')).toBe(false);
  });

  it('enables a fresh domain, requests permission, and stores it', async () => {
    const result = await store.enable('example.com');
    expect(result).toEqual({ kind: 'enabled', host: 'example.com' });
    expect(await store.isEnabled('example.com')).toBe(true);
    expect(await store.getEnabledDomains()).toEqual(['example.com']);
    expect(await permissions.contains(['https://example.com/*'])).toBe(true);
  });

  it('normalizes input (strips scheme/path/case)', async () => {
    const result = await store.enable('  HTTPS://WWW.Example.com/foo  ');
    expect(result).toEqual({ kind: 'enabled', host: 'www.example.com' });
  });

  it('returns already_enabled on a second call', async () => {
    await store.enable('example.com');
    expect(await store.enable('example.com')).toEqual({
      kind: 'already_enabled',
      host: 'example.com',
    });
    expect(await store.getEnabledDomains()).toEqual(['example.com']);
  });

  it('rejects invalid input without touching permissions', async () => {
    expect(await store.enable('')).toMatchObject({
      kind: 'invalid_domain',
      reason: 'empty',
    });
    expect(await store.enable('http://')).toMatchObject({
      kind: 'invalid_domain',
      reason: 'malformed',
    });
    expect(await permissions.getAllOrigins()).toEqual([]);
  });

  it('returns permission_denied when the user declines', async () => {
    permissions.setAutoApprove(false);
    const result = await store.enable('example.com');
    expect(result).toEqual({ kind: 'permission_denied', host: 'example.com' });
    expect(await store.getEnabledDomains()).toEqual([]);
  });

  it('keeps the list sorted', async () => {
    await store.enable('zebra.com');
    await store.enable('alpha.com');
    await store.enable('mango.com');
    expect(await store.getEnabledDomains()).toEqual([
      'alpha.com',
      'mango.com',
      'zebra.com',
    ]);
  });
});

describe('DomainStore — sensitive domain gate', () => {
  let store: DomainStore;
  let permissions: MemoryPermissionsApi;
  beforeEach(() => {
    ({ store, permissions } = setup());
  });

  it('requires confirmSensitive=true to enable a sensitive domain', async () => {
    const result = await store.enable('chase.com');
    expect(result).toMatchObject({
      kind: 'sensitive_confirmation_required',
      host: 'chase.com',
      category: 'banking',
      matched: 'chase.com',
    });
    expect(await store.isEnabled('chase.com')).toBe(false);
    expect(await permissions.getAllOrigins()).toEqual([]);
  });

  it('enables a sensitive domain when confirmation is explicit', async () => {
    const result = await store.enable('chase.com', { confirmSensitive: true });
    expect(result).toEqual({ kind: 'enabled', host: 'chase.com' });
    expect(await store.isEnabled('chase.com')).toBe(true);
  });

  it('applies the gate to subdomains via suffix match', async () => {
    expect(await store.enable('online.chase.com')).toMatchObject({
      kind: 'sensitive_confirmation_required',
    });
  });
});

describe('DomainStore — disable', () => {
  let store: DomainStore;
  let permissions: MemoryPermissionsApi;
  beforeEach(() => {
    ({ store, permissions } = setup());
  });

  it('removes the host from storage and revokes permission', async () => {
    await store.enable('example.com');
    expect(await store.disable('example.com')).toEqual({
      kind: 'disabled',
      host: 'example.com',
    });
    expect(await store.isEnabled('example.com')).toBe(false);
    expect(await permissions.contains(['https://example.com/*'])).toBe(false);
  });

  it('returns not_enabled when the host was not in storage', async () => {
    expect(await store.disable('example.com')).toEqual({
      kind: 'not_enabled',
      host: 'example.com',
    });
  });

  it('rejects invalid input', async () => {
    expect(await store.disable('')).toMatchObject({ kind: 'invalid_domain' });
  });
});

describe('DomainStore — syncWithPermissions', () => {
  it('prunes stored hosts whose permissions were revoked externally', async () => {
    const { storage, permissions, store } = setup();
    // Pretend a previous session enabled a.example and b.example.
    await storage.set('enabled_domains', ['a.example', 'b.example']);
    permissions.primeGranted([buildOriginPattern('a.example')]);
    // (User went to chrome://extensions and revoked b.example.)

    const result = await store.syncWithPermissions();
    expect(result.pruned).toEqual(['b.example']);
    expect(await store.getEnabledDomains()).toEqual(['a.example']);
  });

  it('returns an empty pruned list when storage and permissions agree', async () => {
    const { storage, permissions, store } = setup();
    await storage.set('enabled_domains', ['a.example']);
    permissions.primeGranted([buildOriginPattern('a.example')]);

    const result = await store.syncWithPermissions();
    expect(result.pruned).toEqual([]);
    expect(await store.getEnabledDomains()).toEqual(['a.example']);
  });

  it('handles an empty store gracefully', async () => {
    const { store } = setup();
    expect(await store.syncWithPermissions()).toEqual({ pruned: [] });
  });
});
