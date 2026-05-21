import type { z } from 'zod';
import type { NodeRef } from './node-ref';

export type ValidationResult<T> =
  | { ok: true; value: T; dropped_refs: number }
  | { ok: false; error: z.ZodError };

/**
 * Validate a Claude tool output, then walk the parsed object and drop any
 * `node_ref_id` value that doesn't resolve in the supplied registry. The
 * count is surfaced so the renderer can announce dropped refs via the
 * status region. See architecture.md §8 "Validation, confidence, failure
 * modes."
 */
export function validateToolOutput<T>(
  schema: z.ZodType<T>,
  input: unknown,
  resolveRef: (id: string) => NodeRef | null
): ValidationResult<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error };

  let dropped = 0;
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        if (k === 'node_ref_id' && typeof val === 'string') {
          if (resolveRef(val) === null) {
            dropped++;
            continue;
          }
          out[k] = val;
          continue;
        }
        out[k] = visit(val);
      }
      return out;
    }
    return v;
  };

  const cleaned = visit(parsed.data) as T;
  return { ok: true, value: cleaned, dropped_refs: dropped };
}
