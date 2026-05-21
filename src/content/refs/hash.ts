/**
 * Tiny deterministic hash used inside {@link NodeRef.hashes}. FNV-1a 32-bit
 * is plenty for equality verification — collisions are statistically rare at
 * page scale, and ref resolution always confirms a candidate against role
 * before jumping, so a hash collision alone cannot cause a wrong jump.
 *
 * Output: 8-char lowercase hex string. Stable across runs and platforms.
 */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Normalize a string before hashing: collapse whitespace, trim, lowercase.
 * Used for accessible names where "Sign In" and "  sign  in " should hash
 * to the same value.
 */
export function normalizeForHash(input: string | undefined | null): string {
  if (!input) return '';
  return input.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function hashName(name: string | undefined | null): string {
  return hashString(normalizeForHash(name));
}

export function hashText(text: string | undefined | null): string {
  return hashString(normalizeForHash(text));
}

/**
 * Per-extraction monotonic ID generator. Format matches
 * {@link NodeRefSchema}: `n_` followed by ≥5 lowercase hex chars.
 */
export class NodeIdGenerator {
  private counter = 0;

  next(): string {
    const id = `n_${this.counter.toString(16).padStart(5, '0')}`;
    this.counter++;
    return id;
  }

  reset(): void {
    this.counter = 0;
  }

  get currentCount(): number {
    return this.counter;
  }
}
