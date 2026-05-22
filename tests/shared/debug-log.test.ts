import { describe, expect, it, beforeEach } from 'vitest';
import {
  DebugLog,
  redactString,
  redactContext,
} from '@/shared/debug-log';
import { MemoryStorageBackend } from '@/shared/storage';

describe('redactString', () => {
  it('returns unchanged input when nothing matches', () => {
    expect(redactString('a plain log line')).toBe('a plain log line');
  });

  it('redacts sk-ant- API keys', () => {
    expect(redactString('key=sk-ant-abcdefghij1234567890')).toBe(
      'key=[REDACTED:apikey]'
    );
  });

  it('redacts generic sk- API keys', () => {
    expect(redactString('lurking sk-1234567890abcdefghijklmno here')).toBe(
      'lurking [REDACTED:apikey] here'
    );
  });

  it('prefers the sk-ant- replacement when it matches', () => {
    // The Bearer pattern would also match sk-ant- inside, but the more
    // specific sk-ant- pattern runs first.
    const out = redactString('header: Bearer sk-ant-abcdefghij1234');
    expect(out).toContain('[REDACTED:');
    expect(out).not.toContain('sk-ant-abc');
  });

  it('redacts Bearer tokens', () => {
    expect(redactString('Authorization: Bearer abc.def.ghi.jkl')).toContain(
      '[REDACTED:auth]'
    );
  });

  it('truncates strings longer than 200 chars with an ellipsis', () => {
    const long = 'x'.repeat(500);
    const out = redactString(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain('… [truncated]');
  });
});

describe('redactContext', () => {
  it('replaces values for auth-like keys', () => {
    const ctx = {
      authorization: 'sk-ant-secret',
      'x-api-key': 'sk-secret',
      apikey: 'whatever',
      'api-token': 'foo',
      ordinary: 'visible',
    };
    const out = redactContext(ctx);
    expect(out.authorization).toBe('[REDACTED:auth]');
    expect(out['x-api-key']).toBe('[REDACTED:auth]');
    expect(out.apikey).toBe('[REDACTED:auth]');
    expect(out['api-token']).toBe('[REDACTED:auth]');
    expect(out.ordinary).toBe('visible');
  });

  it('recursively redacts nested objects', () => {
    const ctx = {
      request: {
        headers: { authorization: 'sk-ant-secret' },
        body: { note: 'has key sk-ant-leaked123456789' },
      },
    };
    const out = redactContext(ctx) as {
      request: {
        headers: { authorization: string };
        body: { note: string };
      };
    };
    expect(out.request.headers.authorization).toBe('[REDACTED:auth]');
    expect(out.request.body.note).toContain('[REDACTED:apikey]');
  });

  it('walks array items and redacts strings inside them', () => {
    const ctx = {
      items: ['plain', 'sk-ant-abcdefghij1234567890', { authorization: 'x' }],
    };
    const out = redactContext(ctx) as { items: unknown[] };
    expect(out.items[0]).toBe('plain');
    expect(out.items[1]).toBe('[REDACTED:apikey]');
    expect((out.items[2] as { authorization: string }).authorization).toBe(
      '[REDACTED:auth]'
    );
  });

  it('passes non-string scalars through unchanged', () => {
    const ctx = { n: 42, b: true, nil: null };
    expect(redactContext(ctx)).toEqual({ n: 42, b: true, nil: null });
  });
});

describe('DebugLog', () => {
  let session: MemoryStorageBackend;
  let local: MemoryStorageBackend;
  let log: DebugLog;
  let currentTime: number;

  beforeEach(() => {
    session = new MemoryStorageBackend();
    local = new MemoryStorageBackend();
    currentTime = new Date('2026-05-22T10:00:00').getTime();
    log = new DebugLog(session, local, () => currentTime);
  });

  it('starts disabled', async () => {
    expect(await log.isEnabled()).toBe(false);
  });

  it('writes are no-ops while disabled', async () => {
    await log.error('something broke');
    expect(await log.getEntries()).toEqual([]);
    expect(await log.getCount()).toBe(0);
  });

  it('appends entries when enabled', async () => {
    await log.setEnabled(true);
    await log.info('hello');
    await log.warn('careful');
    await log.error('broken');

    const entries = await log.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.level)).toEqual(['info', 'warn', 'error']);
    expect(entries[0]?.timestamp).toBe(currentTime);
  });

  it('redacts message + context fields on write', async () => {
    await log.setEnabled(true);
    await log.error('key=sk-ant-abcdefghij1234567890', {
      authorization: 'sk-ant-deadbeef1234567890',
      note: 'long ' + 'x'.repeat(300),
    });

    const [entry] = await log.getEntries();
    expect(entry?.message).toBe('key=[REDACTED:apikey]');
    expect(entry?.context?.authorization).toBe('[REDACTED:auth]');
    expect(String(entry?.context?.note)).toContain('… [truncated]');
  });

  it('honors the FIFO cap (drops oldest beyond 200 entries)', async () => {
    await log.setEnabled(true);
    for (let i = 0; i < 205; i++) {
      currentTime = i;
      await log.info(`entry ${i}`);
    }
    const entries = await log.getEntries();
    expect(entries).toHaveLength(200);
    expect(entries[0]?.message).toBe('entry 5');
    expect(entries[entries.length - 1]?.message).toBe('entry 204');
  }, 15_000);

  it('clear() empties the entries but leaves the enabled flag alone', async () => {
    await log.setEnabled(true);
    await log.info('one');
    await log.clear();
    expect(await log.getEntries()).toEqual([]);
    expect(await log.isEnabled()).toBe(true);
  });

  it('setEnabled(false) stops further writes and forgets the flag', async () => {
    await log.setEnabled(true);
    await log.info('still on');
    await log.setEnabled(false);
    await log.info('after off');
    expect(await log.isEnabled()).toBe(false);
    const entries = await log.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toBe('still on');
  });

  it('persists across DebugLog instances on the same storage', async () => {
    await log.setEnabled(true);
    await log.info('survives');
    const other = new DebugLog(session, local, () => currentTime);
    expect(await other.isEnabled()).toBe(true);
    expect(await other.getCount()).toBe(1);
  });

  it('ignores malformed stored entries when reading back', async () => {
    await session.set('debug_log_entries', [
      { timestamp: 1, level: 'info', message: 'ok' },
      'not an object',
      { junk: true },
    ]);
    expect(await log.getEntries()).toHaveLength(1);
  });
});
