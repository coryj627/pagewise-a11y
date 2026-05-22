import type { StorageBackend } from './storage';
import type { TokenUsageBreakdown } from './pricing';

const STORAGE_KEY = 'cost_ledger';
const MAX_ENTRIES = 1000;

export interface CostEntry extends TokenUsageBreakdown {
  /** ms since epoch */
  timestamp: number;
  model: string;
  cost_usd: number;
}

export interface UsageSummary {
  count: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
}

/**
 * Local-only BYOK usage ledger. Architecture §10.9: users monitor their
 * own Anthropic spend via session/day/month totals shown in the options
 * page. No data leaves the device — this is a per-install record kept in
 * chrome.storage.local.
 *
 * Capped FIFO at 1000 entries. Older entries are dropped to keep storage
 * bounded; if long-term aggregation matters later, we add a separate
 * monthly-rollup record before pruning.
 */
export class CostLedger {
  constructor(
    private readonly storage: StorageBackend,
    private readonly clock: () => number = Date.now
  ) {}

  async record(
    entry: Omit<CostEntry, 'timestamp'> & { timestamp?: number }
  ): Promise<CostEntry> {
    const stored: CostEntry = {
      ...entry,
      timestamp: entry.timestamp ?? this.clock(),
    };
    const all = await this.getEntries();
    all.push(stored);
    while (all.length > MAX_ENTRIES) all.shift();
    await this.storage.set(STORAGE_KEY, all);
    return stored;
  }

  async getEntries(): Promise<CostEntry[]> {
    const raw = await this.storage.get<unknown>(STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(isCostEntry);
  }

  async getEntriesSince(timestampMs: number): Promise<CostEntry[]> {
    const all = await this.getEntries();
    return all.filter((e) => e.timestamp >= timestampMs);
  }

  async summary(range: { fromMs?: number; toMs?: number } = {}): Promise<UsageSummary> {
    const all = await this.getEntries();
    const from = range.fromMs ?? Number.NEGATIVE_INFINITY;
    const to = range.toMs ?? Number.POSITIVE_INFINITY;
    const filtered = all.filter((e) => e.timestamp >= from && e.timestamp <= to);
    return aggregate(filtered);
  }

  async summaryToday(): Promise<UsageSummary> {
    const now = new Date(this.clock());
    return this.summary({ fromMs: startOfDayLocal(now) });
  }

  async summaryThisMonth(): Promise<UsageSummary> {
    const now = new Date(this.clock());
    return this.summary({ fromMs: startOfMonthLocal(now) });
  }

  async summaryAllTime(): Promise<UsageSummary> {
    return this.summary();
  }

  async clear(): Promise<void> {
    await this.storage.remove(STORAGE_KEY);
  }
}

function startOfDayLocal(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function startOfMonthLocal(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function aggregate(entries: ReadonlyArray<CostEntry>): UsageSummary {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreate = 0;
  let cacheRead = 0;
  let cost = 0;
  for (const e of entries) {
    inputTokens += e.input_tokens;
    outputTokens += e.output_tokens;
    cacheCreate += e.cache_creation_input_tokens ?? 0;
    cacheRead += e.cache_read_input_tokens ?? 0;
    cost += e.cost_usd;
  }
  return {
    count: entries.length,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: cacheCreate,
    cache_read_input_tokens: cacheRead,
    cost_usd: cost,
  };
}

function isCostEntry(v: unknown): v is CostEntry {
  if (v === null || typeof v !== 'object') return false;
  const e = v as Partial<CostEntry>;
  return (
    typeof e.timestamp === 'number' &&
    typeof e.model === 'string' &&
    typeof e.input_tokens === 'number' &&
    typeof e.output_tokens === 'number' &&
    typeof e.cost_usd === 'number'
  );
}
