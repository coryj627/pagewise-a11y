import { describe, expect, it, beforeEach } from 'vitest';
import { OnboardingPreference } from '@/shared/onboarding';
import { MemoryStorageBackend } from '@/shared/storage';

describe('OnboardingPreference', () => {
  let storage: MemoryStorageBackend;
  let pref: OnboardingPreference;
  beforeEach(() => {
    storage = new MemoryStorageBackend();
    pref = new OnboardingPreference(storage);
  });

  it('starts not dismissed', async () => {
    expect(await pref.isDismissed()).toBe(false);
  });

  it('persists dismissal', async () => {
    await pref.dismiss();
    expect(await pref.isDismissed()).toBe(true);
    const second = new OnboardingPreference(storage);
    expect(await second.isDismissed()).toBe(true);
  });

  it('reset() clears dismissal', async () => {
    await pref.dismiss();
    await pref.reset();
    expect(await pref.isDismissed()).toBe(false);
  });

  it('treats non-boolean stored values as not dismissed', async () => {
    await storage.set('onboarding_dismissed', 'maybe');
    expect(await pref.isDismissed()).toBe(false);
  });
});
