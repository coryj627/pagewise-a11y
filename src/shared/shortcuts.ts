/**
 * Async wrapper over `chrome.commands` plus pure helpers for rendering a
 * keystroke as a sequence of `<kbd>` labels. The wrapper exists so the
 * options UI can read the *live* shortcut binding (which the user can
 * rebind at `chrome://extensions/shortcuts`) instead of hard-coding the
 * default. The pure helpers exist so jsdom tests can exercise the
 * platform-specific formatting without spinning up a Chrome stub.
 */

/** A coarse platform tag — Pagewise only cares about Mac vs. everything else
 *  because Mac is the only platform that renders modifier glyphs by
 *  convention (⌥ ⇧ ⌘). */
export type Platform = 'mac' | 'other';

/** The action whose binding the welcome card teaches. Matches the
 *  reserved name in `manifest.json`. */
export const ACTION_COMMAND_NAME = '_execute_action';

export interface ShortcutQuery {
  /**
   * Return the raw shortcut string for the toolbar-action command (e.g.
   * `"Alt+Shift+P"`), or `null` if the user has cleared the binding.
   * Chrome returns `""` for an unbound command — we normalize that to
   * `null` so callers don't have to special-case empty strings.
   */
  getActionShortcut(): Promise<string | null>;
}

/** Production implementation. Safe to call before the user has interacted
 *  with the page — `chrome.commands.getAll` does not require a gesture. */
export class ChromeShortcutQuery implements ShortcutQuery {
  async getActionShortcut(): Promise<string | null> {
    const commands = await chrome.commands.getAll();
    const action = commands.find((c) => c.name === ACTION_COMMAND_NAME);
    const shortcut = action?.shortcut ?? '';
    return shortcut === '' ? null : shortcut;
  }
}

/** In-memory test implementation. Defaults to the manifest's documented
 *  default so tests that don't care about the binding still see a
 *  Mac-friendly render. */
export class MemoryShortcutQuery implements ShortcutQuery {
  private shortcut: string | null;
  constructor(shortcut: string | null = 'Alt+Shift+P') {
    this.shortcut = shortcut;
  }
  async getActionShortcut(): Promise<string | null> {
    return this.shortcut;
  }
  /** Test helper — not part of the production interface. */
  setShortcut(value: string | null): void {
    this.shortcut = value;
  }
}

/**
 * Detect the user's platform without throwing on environments where
 * `navigator` is missing (service worker contexts). Uses
 * `userAgentData.platform` when available and falls back to the legacy
 * `navigator.platform` string. Anything Apple-shaped counts as Mac.
 */
export function detectPlatform(nav: Navigator | undefined = globalThis.navigator): Platform {
  if (nav === undefined) return 'other';
  // userAgentData is the modern, spoof-resistant signal; not all browsers
  // expose it yet (Firefox/Safari), hence the fallback below.
  const uaData = (nav as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData;
  const platform = uaData?.platform ?? nav.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform) ? 'mac' : 'other';
}

/**
 * Split a Chrome shortcut string (`"Alt+Shift+P"`, `"Ctrl+Shift+F5"`,
 * etc.) into the labels we want to render inside `<kbd>` elements,
 * mapping modifier names to glyphs on Mac.
 *
 * Chrome's command-binding format always uses words (`Alt`, `Shift`,
 * `Ctrl`, `Command`, `MacCtrl`) joined by `+`, regardless of OS — see
 * https://developer.chrome.com/docs/extensions/reference/api/commands.
 * `Ctrl` in a cross-platform default maps to ⌘ Command on macOS; users
 * who explicitly want ⌃ Control on Mac specify `MacCtrl`. The mapping
 * here mirrors that behavior so the welcome card matches what the user
 * actually presses.
 */
export function formatKeystrokeKeys(
  shortcut: string,
  platform: Platform
): string[] {
  const parts = shortcut.split('+').map((p) => p.trim()).filter((p) => p !== '');
  if (platform !== 'mac') return parts;
  return parts.map((part) => {
    switch (part) {
      case 'Alt':
      case 'Option':
        return '⌥';
      case 'Shift':
        return '⇧';
      case 'Ctrl':
      case 'Command':
        // Chrome maps cross-platform Ctrl to ⌘ on macOS; explicit Command
        // also renders as ⌘. Either way the user presses the same key.
        return '⌘';
      case 'MacCtrl':
        return '⌃';
      default:
        return part;
    }
  });
}
