import { describe, expect, it, beforeEach } from 'vitest';
import { ApiKeyStore } from '@/shared/api-key';
import { MemoryStorageBackend } from '@/shared/storage';

describe('ApiKeyStore', () => {
  let storage: MemoryStorageBackend;
  let store: ApiKeyStore;
  beforeEach(() => {
    storage = new MemoryStorageBackend();
    store = new ApiKeyStore(storage);
  });

  it('returns null when no key is set', async () => {
    expect(await store.get()).toBeNull();
    expect(await store.isSet()).toBe(false);
  });

  it('round-trips a value', async () => {
    await store.set('sk-ant-abc-12345-XYZ');
    expect(await store.get()).toBe('sk-ant-abc-12345-XYZ');
    expect(await store.isSet()).toBe(true);
  });

  it('trims whitespace on set', async () => {
    await store.set('  sk-ant-test-key   ');
    expect(await store.get()).toBe('sk-ant-test-key');
  });

  it('clears via clear()', async () => {
    await store.set('sk-ant-key');
    await store.clear();
    expect(await store.get()).toBeNull();
  });

  it('treats empty set() as clear()', async () => {
    await store.set('sk-ant-key');
    await store.set('   ');
    expect(await store.get()).toBeNull();
  });

  it('persists across instances backed by the same storage', async () => {
    await store.set('sk-ant-persistent');
    const second = new ApiKeyStore(storage);
    expect(await second.get()).toBe('sk-ant-persistent');
  });

  it('ignores non-string values that might appear in storage', async () => {
    await storage.set('anthropic_api_key', 42);
    expect(await store.get()).toBeNull();
  });
});

describe('ApiKeyStore.mask', () => {
  it('renders "(not set)" for null', () => {
    expect(ApiKeyStore.mask(null)).toBe('(not set)');
  });

  it('shows the first 5 and last 4 characters', () => {
    expect(ApiKeyStore.mask('sk-ant-1234567890abcd')).toBe('sk-an…abcd');
  });

  it('renders "(not set)" for suspiciously short strings', () => {
    expect(ApiKeyStore.mask('xx')).toBe('(not set)');
  });
});
