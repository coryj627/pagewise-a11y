import type { StorageBackend } from './storage';

const STORAGE_KEY = 'disclosure_pref';
const AUTO_DISABLE_AFTER = 5;

export type DisclosureMode = 'always' | 'never' | 'auto_first_5';

interface StoredState {
  mode: DisclosureMode;
  /** How many times the user has confirmed the prompt. */
  counter: number;
}

const DEFAULT_STATE: StoredState = { mode: 'auto_first_5', counter: 0 };

/**
 * Controls whether the side panel shows the "About to analyze this page —
 * estimated input X tokens, cost $Y" prompt before an AI call. Per
 * architecture.md §10.9, the default is to show it for the first five
 * uses, then auto-disable so it doesn't become noise once the user has
 * internalized the cost.
 *
 * Modes:
 *   "always"        → always prompt.
 *   "never"         → never prompt.
 *   "auto_first_5"  → prompt until counter reaches 5 confirmations,
 *                     then act like "never". User can revisit via
 *                     options to force a reset.
 */
export class DisclosurePreference {
  constructor(private readonly storage: StorageBackend) {}

  async getMode(): Promise<DisclosureMode> {
    return (await this.read()).mode;
  }

  async setMode(mode: DisclosureMode): Promise<void> {
    const cur = await this.read();
    await this.write({ ...cur, mode });
  }

  async getCounter(): Promise<number> {
    return (await this.read()).counter;
  }

  async shouldPrompt(): Promise<boolean> {
    const state = await this.read();
    switch (state.mode) {
      case 'always':
        return true;
      case 'never':
        return false;
      case 'auto_first_5':
        return state.counter < AUTO_DISABLE_AFTER;
    }
  }

  /** Increment the confirmation counter after the user clicks Send. */
  async recordConfirmation(): Promise<void> {
    const cur = await this.read();
    await this.write({ ...cur, counter: cur.counter + 1 });
  }

  /** Reset to defaults — counter back to 0, mode back to auto_first_5. */
  async reset(): Promise<void> {
    await this.write(DEFAULT_STATE);
  }

  private async read(): Promise<StoredState> {
    const raw = await this.storage.get<unknown>(STORAGE_KEY);
    if (raw === undefined || raw === null || typeof raw !== 'object') {
      return DEFAULT_STATE;
    }
    const s = raw as Partial<StoredState>;
    const mode: DisclosureMode =
      s.mode === 'always' || s.mode === 'never' || s.mode === 'auto_first_5'
        ? s.mode
        : DEFAULT_STATE.mode;
    const counter =
      typeof s.counter === 'number' && Number.isFinite(s.counter) && s.counter >= 0
        ? Math.floor(s.counter)
        : 0;
    return { mode, counter };
  }

  private async write(state: StoredState): Promise<void> {
    await this.storage.set(STORAGE_KEY, state);
  }
}

export const DISCLOSURE_AUTO_DISABLE_AFTER = AUTO_DISABLE_AFTER;
