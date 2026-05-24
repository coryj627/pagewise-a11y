import { describe, expect, it } from 'vitest';
import {
  ChromeShortcutQuery,
  MemoryShortcutQuery,
  detectPlatform,
  formatKeystrokeKeys,
} from '@/shared/shortcuts';

describe('formatKeystrokeKeys', () => {
  it('returns word labels unchanged on non-Mac platforms', () => {
    expect(formatKeystrokeKeys('Alt+Shift+P', 'other')).toEqual([
      'Alt',
      'Shift',
      'P',
    ]);
    expect(formatKeystrokeKeys('Ctrl+Shift+F5', 'other')).toEqual([
      'Ctrl',
      'Shift',
      'F5',
    ]);
  });

  it('maps the three common modifiers to Mac glyphs', () => {
    expect(formatKeystrokeKeys('Alt+Shift+P', 'mac')).toEqual(['⌥', '⇧', 'P']);
  });

  it('treats cross-platform Ctrl as ⌘ on Mac (Chrome semantics)', () => {
    // Chrome maps a `Ctrl+...` default to ⌘ on macOS unless the manifest
    // says `MacCtrl`. Mirror that mapping so what we render matches what
    // the user actually presses.
    expect(formatKeystrokeKeys('Ctrl+Shift+P', 'mac')).toEqual(['⌘', '⇧', 'P']);
  });

  it('maps explicit MacCtrl to ⌃', () => {
    expect(formatKeystrokeKeys('MacCtrl+P', 'mac')).toEqual(['⌃', 'P']);
  });

  it('passes single character keys through verbatim', () => {
    expect(formatKeystrokeKeys('Alt+9', 'mac')).toEqual(['⌥', '9']);
  });

  it('handles a single-key binding with no modifiers', () => {
    expect(formatKeystrokeKeys('F6', 'mac')).toEqual(['F6']);
    expect(formatKeystrokeKeys('F6', 'other')).toEqual(['F6']);
  });

  it('tolerates stray whitespace and empty segments', () => {
    expect(formatKeystrokeKeys(' Alt + Shift + P ', 'other')).toEqual([
      'Alt',
      'Shift',
      'P',
    ]);
  });
});

describe('detectPlatform', () => {
  it('returns "mac" for any Apple userAgentData platform', () => {
    const nav = { platform: '', userAgentData: { platform: 'macOS' } };
    expect(detectPlatform(nav as unknown as Navigator)).toBe('mac');
  });

  it('falls back to navigator.platform when userAgentData is absent', () => {
    const nav = { platform: 'MacIntel' };
    expect(detectPlatform(nav as unknown as Navigator)).toBe('mac');
  });

  it('returns "other" for anything not Mac/iOS-shaped', () => {
    expect(detectPlatform({ platform: 'Win32' } as unknown as Navigator)).toBe(
      'other'
    );
    expect(
      detectPlatform({ platform: 'Linux x86_64' } as unknown as Navigator)
    ).toBe('other');
  });

  it('returns "other" when no navigator exists (e.g. SW context)', () => {
    expect(detectPlatform(undefined)).toBe('other');
  });
});

describe('MemoryShortcutQuery', () => {
  it('defaults to the manifest default binding', async () => {
    const q = new MemoryShortcutQuery();
    expect(await q.getActionShortcut()).toBe('Alt+Shift+P');
  });

  it('returns null when constructed with an unbound shortcut', async () => {
    const q = new MemoryShortcutQuery(null);
    expect(await q.getActionShortcut()).toBeNull();
  });

  it('reflects mutations via setShortcut', async () => {
    const q = new MemoryShortcutQuery();
    q.setShortcut('Ctrl+Shift+Y');
    expect(await q.getActionShortcut()).toBe('Ctrl+Shift+Y');
    q.setShortcut(null);
    expect(await q.getActionShortcut()).toBeNull();
  });
});

describe('ChromeShortcutQuery', () => {
  it('returns the shortcut string for _execute_action', async () => {
    const original = globalThis.chrome;
    (globalThis as { chrome?: unknown }).chrome = {
      commands: {
        getAll: async () => [
          { name: '_execute_action', shortcut: 'Alt+Shift+P' },
        ],
      },
    };
    try {
      expect(await new ChromeShortcutQuery().getActionShortcut()).toBe(
        'Alt+Shift+P'
      );
    } finally {
      (globalThis as { chrome?: unknown }).chrome = original;
    }
  });

  it('normalizes Chrome\'s empty-string "unbound" to null', async () => {
    const original = globalThis.chrome;
    (globalThis as { chrome?: unknown }).chrome = {
      commands: {
        getAll: async () => [{ name: '_execute_action', shortcut: '' }],
      },
    };
    try {
      expect(await new ChromeShortcutQuery().getActionShortcut()).toBeNull();
    } finally {
      (globalThis as { chrome?: unknown }).chrome = original;
    }
  });

  it('returns null when the action command is missing entirely', async () => {
    const original = globalThis.chrome;
    (globalThis as { chrome?: unknown }).chrome = {
      commands: { getAll: async () => [] },
    };
    try {
      expect(await new ChromeShortcutQuery().getActionShortcut()).toBeNull();
    } finally {
      (globalThis as { chrome?: unknown }).chrome = original;
    }
  });
});
