import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryPermissionsApi } from '@/shared/permissions';

describe('MemoryPermissionsApi', () => {
  let perms: MemoryPermissionsApi;
  beforeEach(() => {
    perms = new MemoryPermissionsApi();
  });

  it('starts empty', async () => {
    expect(await perms.getAllOrigins()).toEqual([]);
    expect(await perms.contains(['https://example.com/*'])).toBe(false);
  });

  it('auto-grants on request by default', async () => {
    const granted = await perms.request(['https://example.com/*']);
    expect(granted).toBe(true);
    expect(await perms.contains(['https://example.com/*'])).toBe(true);
  });

  it('returns false from request when autoApprove is disabled', async () => {
    perms.setAutoApprove(false);
    expect(await perms.request(['https://example.com/*'])).toBe(false);
    expect(await perms.contains(['https://example.com/*'])).toBe(false);
  });

  it('removes individual origins', async () => {
    await perms.request(['https://a.example/*', 'https://b.example/*']);
    expect(await perms.remove(['https://a.example/*'])).toBe(true);
    expect(await perms.contains(['https://a.example/*'])).toBe(false);
    expect(await perms.contains(['https://b.example/*'])).toBe(true);
  });

  it('contains() returns true only when ALL listed origins are granted', async () => {
    await perms.request(['https://a.example/*']);
    expect(await perms.contains(['https://a.example/*'])).toBe(true);
    expect(
      await perms.contains(['https://a.example/*', 'https://b.example/*'])
    ).toBe(false);
  });

  it('primeGranted seeds state without a request', async () => {
    perms.primeGranted(['https://x.example/*']);
    expect(await perms.contains(['https://x.example/*'])).toBe(true);
  });

  it('getAllOrigins lists granted origins', async () => {
    await perms.request(['https://a.example/*', 'https://b.example/*']);
    const list = await perms.getAllOrigins();
    expect(list).toHaveLength(2);
    expect(list).toContain('https://a.example/*');
    expect(list).toContain('https://b.example/*');
  });
});
