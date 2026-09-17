import { describe, expect, it } from "vitest";
import {
  createSerialQueue,
  cursorAfterFailure,
  cursorAfterRun,
  isGap,
  MAX_PENDING,
  planRun,
  readCursor,
  writeCursor,
} from "@/lib/sync/hdc-feed-state";

/**
 * The webhook answers before it applies, so HDCtool no longer retries a failed
 * apply. Whether a failure is remembered is decided entirely by these rules.
 */

const delivery = (over: Partial<{ seq: number; prevSeq: number; sentAt: string | null; mtrl: number[] }> = {}) => ({
  seq: 11,
  prevSeq: 10,
  sentAt: "2026-09-17T10:00:00.000Z",
  mtrl: [1, 2, 3],
  ...over,
});

describe("cursor text", () => {
  it("reads the cursor written before pending ids existed", () => {
    expect(readCursor('{"lastSeq":10,"sentAt":"2026-09-17T09:55:00.000Z"}')).toEqual({
      lastSeq: 10,
      sentAt: "2026-09-17T09:55:00.000Z",
      pendingMtrl: [],
    });
  });

  it("survives empty and malformed text", () => {
    expect(readCursor(null)).toEqual({ lastSeq: 0, sentAt: null, pendingMtrl: [] });
    expect(readCursor("not json")).toEqual({ lastSeq: 0, sentAt: null, pendingMtrl: [] });
  });

  it("drops junk from the pending list", () => {
    const cursor = readCursor('{"lastSeq":1,"sentAt":null,"pendingMtrl":[5,5,"x",-1,2.5,7]}');
    expect(cursor.pendingMtrl).toEqual([5, 7]);
  });

  it("round-trips, and writes the old shape when nothing is pending", () => {
    const withPending = { lastSeq: 3, sentAt: "t", pendingMtrl: [9] };
    expect(readCursor(writeCursor(withPending))).toEqual(withPending);
    expect(writeCursor({ lastSeq: 3, sentAt: "t", pendingMtrl: [] })).toBe(
      '{"lastSeq":3,"sentAt":"t"}',
    );
  });
});

describe("isGap", () => {
  it("is not a gap on the very first delivery", () => {
    expect(isGap({ lastSeq: 0, sentAt: null, pendingMtrl: [] }, 42)).toBe(false);
  });

  it("is a gap when prevSeq does not match", () => {
    expect(isGap({ lastSeq: 10, sentAt: null, pendingMtrl: [] }, 9)).toBe(true);
    expect(isGap({ lastSeq: 10, sentAt: null, pendingMtrl: [] }, 10)).toBe(false);
  });
});

describe("planRun", () => {
  it("applies owed ids first and never drops the overflow", () => {
    expect(planRun([7, 8], [8, 9, 10], 3)).toEqual({ now: [7, 8, 9], later: [10] });
  });
});

describe("cursorAfterFailure", () => {
  const cursor = { lastSeq: 10, sentAt: "2026-09-17T09:55:00.000Z", pendingMtrl: [99] };

  it("keeps the delivery's ids, so a 202 that failed is still owed", () => {
    const next = cursorAfterFailure(cursor, delivery());
    expect(next.pendingMtrl.sort((a, b) => a - b)).toEqual([1, 2, 3, 99]);
  });

  it("moves the sequence on when the ids alone account for the delivery", () => {
    const next = cursorAfterFailure(cursor, delivery());
    expect(next.lastSeq).toBe(11);
    expect(next.sentAt).toBe("2026-09-17T10:00:00.000Z");
  });

  it("holds the sequence when there was a gap before this delivery", () => {
    // The ids of the delivery that never arrived are not in hand; only the
    // timestamp catch-up can find them, and it only runs while the gap shows.
    const next = cursorAfterFailure(cursor, delivery({ prevSeq: 9 }));
    expect(next.lastSeq).toBe(10);
    expect(next.sentAt).toBe("2026-09-17T09:55:00.000Z");
    expect(next.pendingMtrl).toContain(1);
  });

  it("holds the sequence when the ids do not fit", () => {
    const full = { ...cursor, pendingMtrl: Array.from({ length: MAX_PENDING }, (_, i) => i + 1_000_000) };
    const next = cursorAfterFailure(full, delivery());
    expect(next.lastSeq).toBe(10);
    expect(next.pendingMtrl).toHaveLength(MAX_PENDING);
  });
});

describe("cursorAfterRun", () => {
  const cursor = { lastSeq: 10, sentAt: "2026-09-17T09:55:00.000Z", pendingMtrl: [99] };

  it("advances and clears what was applied", () => {
    expect(cursorAfterRun(cursor, delivery(), { caughtUp: true, stillPending: [] })).toEqual({
      lastSeq: 11,
      sentAt: "2026-09-17T10:00:00.000Z",
      pendingMtrl: [],
    });
  });

  it("carries ids that failed individually", () => {
    const next = cursorAfterRun(cursor, delivery(), { caughtUp: true, stillPending: [2, 2] });
    expect(next.pendingMtrl).toEqual([2]);
  });

  it("stays put when a gap's catch-up did not finish, so the next delivery asks again", () => {
    const next = cursorAfterRun(cursor, delivery(), { caughtUp: false, stillPending: [] });
    expect(next.lastSeq).toBe(10);
    expect(next.sentAt).toBe("2026-09-17T09:55:00.000Z");
  });
});

describe("createSerialQueue", () => {
  it("runs one task at a time, in order, and survives a failing task", async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    let active = 0;
    let maxActive = 0;

    const task = (name: string, fail = false) => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      log.push(name);
      active--;
      if (fail) throw new Error(name);
    };

    const all = [
      enqueue(task("a")),
      enqueue(task("b", true)),
      enqueue(task("c")),
    ];
    await expect(Promise.all(all)).resolves.toBeDefined();
    expect(log).toEqual(["a", "b", "c"]);
    expect(maxActive).toBe(1);
  });

  it("settles each task's promise only after that task has run", async () => {
    const enqueue = createSerialQueue();
    let done = false;
    await enqueue(async () => {
      await new Promise((r) => setTimeout(r, 5));
      done = true;
    });
    expect(done).toBe(true);
  });
});
