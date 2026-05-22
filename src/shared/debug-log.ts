/**
 * Off-by-default debug log per architecture §10.8.
 *
 * When enabled, entries are appended to chrome.storage.session (not
 * persistent — they vanish on browser restart). Every entry is passed
 * through a redactor that strips known sensitive shapes before storage:
 *
 *   - API key prefixes: any "sk-ant-…", "sk-…", "Bearer …" run is
 *     replaced with "[REDACTED:apikey]".
 *   - Authorization headers wherever they appear in object values get
 *     replaced with "[REDACTED:auth]".
 *   - Long string values (typically page content) are truncated to a
 *     per-entry cap with "… [truncated]" appended.
 *
 * Capped at 200 entries (FIFO) so an enabled-and-forgotten log can't
 * eat session storage.
 */
import type { StorageBackend } from './storage';

const ENTRIES_KEY = 'debug_log_entries';
const ENABLED_KEY = 'debug_log_enabled';
const MAX_ENTRIES = 200;
const PER_STRING_CAP = 200;
const ELLIPSIS = '… [truncated]';

export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DebugEntry {
  timestamp: number;
  level: DebugLevel;
  message: string;
  /** Optional structured context (redacted before storage). */
  context?: Record<string, unknown>;
}

export class DebugLog {
  constructor(
    /** Where entries live. Use chrome.storage.session in production. */
    private readonly sessionStorage: StorageBackend,
    /** Where the enabled flag lives. Use chrome.storage.local. */
    private readonly enabledStorage: StorageBackend,
    private readonly clock: () => number = Date.now
  ) {}

  async isEnabled(): Promise<boolean> {
    const raw = await this.enabledStorage.get<unknown>(ENABLED_KEY);
    return raw === true;
  }

  async setEnabled(value: boolean): Promise<void> {
    if (value) {
      await this.enabledStorage.set(ENABLED_KEY, true);
    } else {
      await this.enabledStorage.remove(ENABLED_KEY);
    }
  }

  async getEntries(): Promise<DebugEntry[]> {
    const raw = await this.sessionStorage.get<unknown>(ENTRIES_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(isDebugEntry);
  }

  async getCount(): Promise<number> {
    const entries = await this.getEntries();
    return entries.length;
  }

  async clear(): Promise<void> {
    await this.sessionStorage.remove(ENTRIES_KEY);
  }

  async debug(message: string, context?: Record<string, unknown>): Promise<void> {
    return this.write('debug', message, context);
  }
  async info(message: string, context?: Record<string, unknown>): Promise<void> {
    return this.write('info', message, context);
  }
  async warn(message: string, context?: Record<string, unknown>): Promise<void> {
    return this.write('warn', message, context);
  }
  async error(message: string, context?: Record<string, unknown>): Promise<void> {
    return this.write('error', message, context);
  }

  private async write(
    level: DebugLevel,
    message: string,
    context?: Record<string, unknown>
  ): Promise<void> {
    if (!(await this.isEnabled())) return;
    const entry: DebugEntry = {
      timestamp: this.clock(),
      level,
      message: redactString(message),
      ...(context !== undefined ? { context: redactContext(context) } : {}),
    };
    const all = await this.getEntries();
    all.push(entry);
    while (all.length > MAX_ENTRIES) all.shift();
    await this.sessionStorage.set(ENTRIES_KEY, all);
  }
}

// ─────────────────────────────────────────────────────────
// Redaction
// ─────────────────────────────────────────────────────────

/**
 * Patterns that look like API keys. Order matters — broader patterns
 * come last so the specific `sk-ant-…` shape gets named before the
 * generic `sk-…` fallback.
 */
const REDACT_PATTERNS: ReadonlyArray<{ regex: RegExp; replacement: string }> = [
  { regex: /sk-ant-[A-Za-z0-9_-]{10,}/g, replacement: '[REDACTED:apikey]' },
  { regex: /sk-[A-Za-z0-9_-]{20,}/g, replacement: '[REDACTED:apikey]' },
  { regex: /Bearer\s+[A-Za-z0-9_.-]{10,}/gi, replacement: '[REDACTED:auth]' },
];

const AUTH_KEY_PATTERN = /^(authorization|x-api-key|apikey|api[_-]?token)$/i;

export function redactString(input: string): string {
  let out = input;
  for (const { regex, replacement } of REDACT_PATTERNS) {
    out = out.replace(regex, replacement);
  }
  if (out.length > PER_STRING_CAP) {
    out = `${out.slice(0, PER_STRING_CAP)}${ELLIPSIS}`;
  }
  return out;
}

export function redactContext(
  context: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

function redactValue(key: string, value: unknown): unknown {
  if (AUTH_KEY_PATTERN.test(key)) return '[REDACTED:auth]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((v, i) => redactValue(String(i), v));
  if (value !== null && typeof value === 'object') {
    return redactContext(value as Record<string, unknown>);
  }
  return value;
}

function isDebugEntry(v: unknown): v is DebugEntry {
  if (v === null || typeof v !== 'object') return false;
  const e = v as Partial<DebugEntry>;
  return (
    typeof e.timestamp === 'number' &&
    typeof e.message === 'string' &&
    (e.level === 'debug' ||
      e.level === 'info' ||
      e.level === 'warn' ||
      e.level === 'error')
  );
}
