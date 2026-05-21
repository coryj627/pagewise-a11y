import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryStorageBackend } from '@/shared/storage';

describe('MemoryStorageBackend', () => {
  let storage: MemoryStorageBackend;
  beforeEach(() => {
    storage = new MemoryStorageBackend();
  });

  it('returns undefined for missing keys', async () => {
    expect(await storage.get('missing')).toBeUndefined();
  });

  it('round-trips a value', async () => {
    await storage.set('k', { a: 1, b: [2, 3] });
    expect(await storage.get('k')).toEqual({ a: 1, b: [2, 3] });
  });

  it('overwrites on repeat set', async () => {
    await storage.set('k', 1);
    await storage.set('k', 2);
    expect(await storage.get('k')).toBe(2);
  });

  it('removes keys', async () => {
    await storage.set('k', 1);
    await storage.remove('k');
    expect(await storage.get('k')).toBeUndefined();
  });

  it('clear() wipes everything', async () => {
    await storage.set('a', 1);
    await storage.set('b', 2);
    storage.clear();
    expect(await storage.get('a')).toBeUndefined();
    expect(await storage.get('b')).toBeUndefined();
  });
});
