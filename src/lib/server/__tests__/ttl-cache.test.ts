import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/lib/server/ttl-cache";

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("TtlCache", () => {
  it("serves a repeated key from memory", async () => {
    const cache = new TtlCache<number>({ maxEntries: 10, ttlMs: 300_000 });
    const load = vi.fn(async () => 42);
    expect(await cache.getOrLoad("k", load)).toBe(42);
    expect(await cache.getOrLoad("k", load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("expires entries after the TTL", async () => {
    const c = clock();
    const cache = new TtlCache<number>({ maxEntries: 10, ttlMs: 300_000, now: c.now });
    const load = vi.fn(async () => 1);
    await cache.getOrLoad("k", load);
    c.advance(299_999);
    await cache.getOrLoad("k", load);
    expect(load).toHaveBeenCalledTimes(1);
    c.advance(1);
    await cache.getOrLoad("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one load between concurrent callers", async () => {
    const cache = new TtlCache<number>({ maxEntries: 10, ttlMs: 1_000 });
    let resolve!: (v: number) => void;
    const load = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const all = Promise.all(Array.from({ length: 50 }, () => cache.getOrLoad("k", load)));
    resolve(7);
    expect(await all).toEqual(Array(50).fill(7));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const cache = new TtlCache<number>({ maxEntries: 10, ttlMs: 1_000 });
    await expect(cache.getOrLoad("k", async () => Promise.reject(new Error("db")))).rejects.toThrow("db");
    expect(await cache.getOrLoad("k", async () => 3)).toBe(3);
  });

  it("stays within maxEntries, evicting the least recently used", async () => {
    const cache = new TtlCache<string>({ maxEntries: 2, ttlMs: 1_000 });
    await cache.getOrLoad("a", async () => "a");
    await cache.getOrLoad("b", async () => "b");
    await cache.getOrLoad("a", async () => "a2"); // touch a
    await cache.getOrLoad("c", async () => "c"); // evicts b
    expect(cache.size).toBe(2);
    expect(await cache.getOrLoad("a", async () => "reloaded")).toBe("a");
    expect(await cache.getOrLoad("b", async () => "reloaded")).toBe("reloaded");
  });

  it("clear() empties the cache", async () => {
    const cache = new TtlCache<number>({ maxEntries: 10, ttlMs: 300_000 });
    await cache.getOrLoad("k", async () => 1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(await cache.getOrLoad("k", async () => 2)).toBe(2);
  });

  it("does not let a load that started before clear() repopulate stale data", async () => {
    const cache = new TtlCache<string>({ maxEntries: 10, ttlMs: 300_000 });
    let finishOld!: (v: string) => void;
    const old = cache.getOrLoad("k", () => new Promise<string>((r) => (finishOld = r)));
    cache.clear();
    // A caller after the clear does not join the stale load.
    const fresh = cache.getOrLoad("k", async () => "new");
    finishOld("old");
    expect(await old).toBe("old");
    expect(await fresh).toBe("new");
    expect(await cache.getOrLoad("k", async () => "again")).toBe("new");
  });
});

