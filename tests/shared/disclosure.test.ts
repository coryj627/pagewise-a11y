import { describe, expect, it, beforeEach } from 'vitest';
import {
  DisclosurePreference,
  DISCLOSURE_AUTO_DISABLE_AFTER,
} from '@/shared/disclosure';
import { MemoryStorageBackend } from '@/shared/storage';

describe('DisclosurePreference', () => {
  let storage: MemoryStorageBackend;
  let pref: DisclosurePreference;
  beforeEach(() => {
    storage = new MemoryStorageBackend();
    pref = new DisclosurePreference(storage);
  });

  it('defaults to auto_first_5 with counter 0', async () => {
    expect(await pref.getMode()).toBe('auto_first_5');
    expect(await pref.getCounter()).toBe(0);
    expect(await pref.shouldPrompt()).toBe(true);
  });

  it('always mode always prompts regardless of counter', async () => {
    await pref.setMode('always');
    expect(await pref.shouldPrompt()).toBe(true);
    for (let i = 0; i < 20; i++) await pref.recordConfirmation();
    expect(await pref.shouldPrompt()).toBe(true);
  });

  it('never mode never prompts', async () => {
    await pref.setMode('never');
    expect(await pref.shouldPrompt()).toBe(false);
  });

  it('auto_first_5 auto-disables once counter reaches the limit', async () => {
    expect(await pref.shouldPrompt()).toBe(true);
    for (let i = 1; i <= DISCLOSURE_AUTO_DISABLE_AFTER; i++) {
      await pref.recordConfirmation();
      const expected = i < DISCLOSURE_AUTO_DISABLE_AFTER;
      expect(await pref.shouldPrompt()).toBe(expected);
    }
    // After hitting the limit, never prompts again in auto mode.
    expect(await pref.shouldPrompt()).toBe(false);
  });

  it('changing mode does not reset the counter', async () => {
    await pref.recordConfirmation();
    await pref.recordConfirmation();
    await pref.setMode('always');
    expect(await pref.getCounter()).toBe(2);
    await pref.setMode('auto_first_5');
    expect(await pref.getCounter()).toBe(2);
  });

  it('reset() restores defaults', async () => {
    await pref.setMode('never');
    await pref.recordConfirmation();
    await pref.recordConfirmation();
    await pref.reset();
    expect(await pref.getMode()).toBe('auto_first_5');
    expect(await pref.getCounter()).toBe(0);
  });

  it('persists across instances backed by the same storage', async () => {
    await pref.setMode('never');
    await pref.recordConfirmation();
    const other = new DisclosurePreference(storage);
    expect(await other.getMode()).toBe('never');
    expect(await other.getCounter()).toBe(1);
  });

  it('tolerates malformed stored values by falling back to defaults', async () => {
    await storage.set('disclosure_pref', { mode: 'maybe', counter: -3 });
    expect(await pref.getMode()).toBe('auto_first_5');
    expect(await pref.getCounter()).toBe(0);
  });

  it('tolerates non-object stored values', async () => {
    await storage.set('disclosure_pref', 'corrupted');
    expect(await pref.getMode()).toBe('auto_first_5');
  });
});
