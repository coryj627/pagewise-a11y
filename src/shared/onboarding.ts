import type { StorageBackend } from './storage';

const STORAGE_KEY = 'onboarding_dismissed';

/**
 * Tiny preference store that remembers whether the user has dismissed the
 * first-run welcome card. We dismiss automatically once both setup tasks
 * are complete (API key + ≥1 domain), and we also expose an explicit
 * Dismiss button for users who already know the ropes.
 */
export class OnboardingPreference {
  constructor(private readonly storage: StorageBackend) {}

  async isDismissed(): Promise<boolean> {
    const raw = await this.storage.get<unknown>(STORAGE_KEY);
    return raw === true;
  }

  async dismiss(): Promise<void> {
    await this.storage.set(STORAGE_KEY, true);
  }

  async reset(): Promise<void> {
    await this.storage.remove(STORAGE_KEY);
  }
}
