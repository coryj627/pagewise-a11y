/**
 * Maps a {@link NodeRef.id} to the live {@link Element} it was created for.
 * Lives in the content script for the lifetime of an extraction. A new
 * extraction creates a new registry; old refs become resolvable only via
 * the re-resolution algorithm (see {@link ./resolve.ts}).
 *
 * The registry intentionally does not know whether a stored element is
 * still attached to the document — that liveness check belongs to
 * {@link resolveRef}, which keeps the registry pure and easy to test.
 */
export class RefRegistry {
  readonly extractionId: string;
  private readonly map = new Map<string, Element>();

  constructor(extractionId: string) {
    this.extractionId = extractionId;
  }

  set(id: string, element: Element): void {
    this.map.set(id, element);
  }

  get(id: string): Element | undefined {
    return this.map.get(id);
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  delete(id: string): boolean {
    return this.map.delete(id);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  entries(): IterableIterator<[string, Element]> {
    return this.map.entries();
  }
}
