import { afterEach, describe, expect, it, vi } from "vitest";
import { Semaphore } from "@/lib/server/semaphore";

afterEach(() => {
  vi.useRealTimers();
});

describe("Semaphore", () => {
  it("admits up to max at once", async () => {
    const s = new Semaphore(2);
    const a = await s.acquire(0);
    const b = await s.acquire(0);
    expect(a).toBeTypeOf("function");
    expect(b).toBeTypeOf("function");
    expect(await s.acquire(0)).toBeNull();
    expect(s.stats()).toMatchObject({ active: 2, waiting: 0, refused: 1 });
  });

  it("hands a released slot to the next waiter", async () => {
    const s = new Semaphore(1);
    const first = await s.acquire(1_000);
    const waiting = s.acquire(1_000);
    expect(s.stats().waiting).toBe(1);
    first!();
    const second = await waiting;
    expect(second).toBeTypeOf("function");
    expect(s.stats()).toMatchObject({ active: 1, waiting: 0 });
    second!();
    expect(s.stats().active).toBe(0);
  });

  it("gives up after the wait and counts the refusal", async () => {
    vi.useFakeTimers();
    const s = new Semaphore(1);
    await s.acquire(0);
    const waiting = s.acquire(2_000);
    vi.advanceTimersByTime(1_999);
    expect(s.stats().waiting).toBe(1);
    vi.advanceTimersByTime(1);
    expect(await waiting).toBeNull();
    expect(s.stats()).toMatchObject({ active: 1, waiting: 0, refused: 1 });
  });

  it("refuses at once when the queue is full", async () => {
    const s = new Semaphore(1, 1);
    await s.acquire(0);
    void s.acquire(5_000);
    expect(await s.acquire(5_000)).toBeNull();
    expect(s.stats()).toMatchObject({ waiting: 1, refused: 1 });
  });

  it("makes release idempotent", async () => {
    const s = new Semaphore(2);
    const a = await s.acquire(0);
    await s.acquire(0);
    a!();
    a!();
    expect(s.stats().active).toBe(1);
  });

  it("never exceeds max under a burst of 50", async () => {
    const s = new Semaphore(8, 64);
    let inFlight = 0;
    let peak = 0;
    const work = async () => {
      const release = await s.acquire(5_000);
      if (!release) return "refused";
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      release();
      return "done";
    };
    const results = await Promise.all(Array.from({ length: 50 }, work));
    expect(peak).toBe(8);
    expect(results.every((r) => r === "done")).toBe(true);
    expect(s.stats()).toMatchObject({ active: 0, waiting: 0 });
  });
});
