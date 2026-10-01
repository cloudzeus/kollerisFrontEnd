/**
 * A small in-process cache: least-recently-used, time-limited, single-flight.
 *
 * Pure, so it can be tested on its own; `plp.ts` uses it for listing pages.
 *
 *   - bounded by entry count, so a scraper walking combinations evicts old
 *     entries instead of growing the heap;
 *   - entries expire after `ttlMs`;
 *   - concurrent callers for the same key share ONE load. Under a burst of
 *     identical requests that is the difference between one query and fifty.
 *   - a failed load is not cached; the next caller tries again;
 *   - `clear()` drops everything, and a load that was already running when
 *     it was called is not stored when it finishes — it read the old data.
 */

type Entry<V> = { value: V; expires: number };

export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly inflight = new Map<string, Promise<V>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private generation = 0;

  constructor(options: { maxEntries: number; ttlMs: number; now?: () => number }) {
    this.maxEntries = options.maxEntries;
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.generation++;
    this.entries.clear();
    this.inflight.clear();
  }

  async getOrLoad(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      if (hit.expires > this.now()) {
        this.entries.set(key, hit); // most recently used
        return hit.value;
      }
    }

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const generation = this.generation;
    const promise = load().then(
      (value) => {
        if (generation !== this.generation) return value; // cleared meanwhile
        this.inflight.delete(key);
        this.entries.set(key, { value, expires: this.now() + this.ttlMs });
        while (this.entries.size > this.maxEntries) {
          const oldest = this.entries.keys().next().value;
          if (oldest === undefined) break;
          this.entries.delete(oldest);
        }
        return value;
      },
      (error: unknown) => {
        if (generation === this.generation) this.inflight.delete(key);
        throw error;
      },
    );
    this.inflight.set(key, promise);
    return promise;
  }
}
