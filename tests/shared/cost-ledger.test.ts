import { describe, expect, it, beforeEach } from 'vitest';
import { CostLedger, type CostEntry } from '@/shared/cost-ledger';
import { MemoryStorageBackend } from '@/shared/storage';

function setup(now = Date.now()) {
  let current = now;
  const clock = () => current;
  const storage = new MemoryStorageBackend();
  const ledger = new CostLedger(storage, clock);
  const setNow = (t: number): void => {
    current = t;
  };
  return { storage, ledger, setNow, get now() { return current; } };
}

function entry(partial: Partial<CostEntry> = {}): Omit<CostEntry, 'timestamp'> {
  return {
    model: 'claude-sonnet-4-6',
    input_tokens: 1000,
    output_tokens: 100,
    cost_usd: 0.005,
    ...partial,
  };
}

describe('CostLedger', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup(new Date('2026-05-21T15:00:00').getTime());
  });

  it('starts empty', async () => {
    expect(await env.ledger.getEntries()).toEqual([]);
    const summary = await env.ledger.summaryAllTime();
    expect(summary).toEqual({
      count: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cost_usd: 0,
    });
  });

  it('records an entry with the current clock when timestamp omitted', async () => {
    const saved = await env.ledger.record(entry());
    expect(saved.timestamp).toBe(env.now);
    expect(await env.ledger.getEntries()).toEqual([saved]);
  });

  it('accumulates totals across records', async () => {
    await env.ledger.record(entry({ input_tokens: 100, output_tokens: 50, cost_usd: 0.01 }));
    await env.ledger.record(entry({ input_tokens: 200, output_tokens: 50, cost_usd: 0.02 }));
    const summary = await env.ledger.summaryAllTime();
    expect(summary.count).toBe(2);
    expect(summary.input_tokens).toBe(300);
    expect(summary.output_tokens).toBe(100);
    expect(summary.cost_usd).toBeCloseTo(0.03, 6);
  });

  it('summaryToday includes today but not yesterday', async () => {
    // Seed yesterday's entry by advancing the clock backward via timestamp override.
    const yesterday = env.now - 24 * 60 * 60 * 1000;
    await env.ledger.record({ ...entry({ cost_usd: 0.10 }), timestamp: yesterday });
    await env.ledger.record(entry({ cost_usd: 0.01 }));

    const today = await env.ledger.summaryToday();
    expect(today.count).toBe(1);
    expect(today.cost_usd).toBeCloseTo(0.01, 6);

    const allTime = await env.ledger.summaryAllTime();
    expect(allTime.count).toBe(2);
  });

  it('summaryThisMonth excludes last month', async () => {
    // 35 days ago is in the previous month.
    const lastMonth = env.now - 35 * 24 * 60 * 60 * 1000;
    await env.ledger.record({ ...entry({ cost_usd: 1.00 }), timestamp: lastMonth });
    await env.ledger.record(entry({ cost_usd: 0.05 }));

    const month = await env.ledger.summaryThisMonth();
    expect(month.count).toBe(1);
    expect(month.cost_usd).toBeCloseTo(0.05, 6);
  });

  it('caps storage at the FIFO limit (drops oldest)', async () => {
    // Insert 1005 entries; expect only the last 1000 to remain.
    for (let i = 0; i < 1005; i++) {
      await env.ledger.record({
        ...entry({ input_tokens: i }),
        timestamp: env.now + i,
      });
    }
    const all = await env.ledger.getEntries();
    expect(all.length).toBe(1000);
    expect(all[0]?.input_tokens).toBe(5);
    expect(all[all.length - 1]?.input_tokens).toBe(1004);
  }, 15000);

  it('clear() empties the ledger', async () => {
    await env.ledger.record(entry());
    await env.ledger.clear();
    expect(await env.ledger.getEntries()).toEqual([]);
  });

  it('aggregates cache token fields into the summary', async () => {
    await env.ledger.record(
      entry({
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 200,
      })
    );
    const s = await env.ledger.summaryAllTime();
    expect(s.cache_creation_input_tokens).toBe(500);
    expect(s.cache_read_input_tokens).toBe(200);
  });

  it('ignores malformed entries when reading back stale storage', async () => {
    const env2 = setup();
    await env2.storage.set('cost_ledger', [
      { ...entry(), timestamp: 1 }, // valid
      { junk: true }, // invalid
      'not-an-object', // invalid
    ]);
    const all = await env2.ledger.getEntries();
    expect(all).toHaveLength(1);
  });
});
