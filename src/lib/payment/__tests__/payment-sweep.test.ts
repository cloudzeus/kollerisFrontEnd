import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The sweep, with Viva and the paid path replaced by `recheck` and the database
 * by a handful of recorders. What is under test is the selection, the lock,
 * the budget and the bookkeeping — the paid path has its own tests.
 */
const h = vi.hoisted(() => {
  const syncRow: { lastRunAt: Date | null; lastStatus: string | null; lastSuccessAt?: Date } = {
    lastRunAt: null,
    lastStatus: null,
  };
  const db = {
    locked: true,
    orders: [] as Array<{ orderNumber: string }>,
    syncRow: syncRow as typeof syncRow | null,
  };
  const prisma = {
    order: { findMany: vi.fn(async () => db.orders) },
    syncState: {
      findUnique: vi.fn(async () => (db.syncRow ? { ...db.syncRow } : null)),
      upsert: vi.fn(async ({ update, create }: { update: object; create: object }) => {
        db.syncRow = db.syncRow ? Object.assign(db.syncRow, update) : ({ ...create } as typeof syncRow);
        return db.syncRow;
      }),
      update: vi.fn(async ({ data }: { data: object }) => Object.assign(db.syncRow ?? {}, data)),
    },
    $queryRaw: vi.fn(async () => [{ locked: db.locked }]),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return {
    db,
    prisma,
    recheck: vi.fn(),
    configured: vi.fn(() => true),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/payment/viva", () => ({ isVivaBasicConfigured: h.configured }));
vi.mock("@/lib/payment/confirm-payment", () => ({ recheckVivaPayment: h.recheck }));

import { parseSweepParams, sweepLogLine, sweepPendingPayments } from "@/lib/payment/payment-sweep";

const followUpsOk = {
  receipt: { ok: true },
  internal: { ok: true },
  erpSync: { ok: true },
  erpDocument: { ok: true, findoc: 1, fincode: "ΠΑΡΚ1", alreadySent: false },
};

const NOW = Date.parse("2026-10-12T10:00:00Z");

beforeEach(() => {
  h.db.locked = true;
  h.db.orders = [];
  h.db.syncRow = { lastRunAt: null, lastStatus: null };
  for (const fn of [
    h.prisma.order.findMany,
    h.prisma.syncState.findUnique,
    h.prisma.syncState.upsert,
    h.prisma.syncState.update,
    h.prisma.$queryRaw,
    h.prisma.$transaction,
  ]) {
    fn.mockClear();
  }
  h.recheck.mockReset();
  h.configured.mockReturnValue(true);
});

describe("selection", () => {
  it("takes awaiting, non-cancelled orders with a Viva code inside the window, oldest first, capped", async () => {
    await sweepPendingPayments({ sinceDays: 10, limit: 50, now: () => NOW });
    const args = h.prisma.order.findMany.mock.calls[0][0 as never] as unknown as {
      where: Record<string, unknown>;
      orderBy: unknown;
      take: number;
    };
    expect(args.where).toEqual({
      paymentStatus: { in: ["PENDING", "FAILED"] },
      status: { not: "CANCELLED" },
      vivaOrderCode: { not: null },
      createdAt: { gte: new Date(NOW - 10 * 86_400_000) },
    });
    expect(args.orderBy).toEqual({ createdAt: "asc" });
    expect(args.take).toBe(50);
  });

  it("clamps the window to 1–60 days and the cap to 1–200", async () => {
    await sweepPendingPayments({ sinceDays: 999, limit: 0, now: () => NOW });
    const args = h.prisma.order.findMany.mock.calls[0][0 as never] as unknown as {
      where: { createdAt: { gte: Date } };
      take: number;
    };
    expect(args.where.createdAt.gte).toEqual(new Date(NOW - 60 * 86_400_000));
    expect(args.take).toBe(1);
  });

  it("single-order mode looks at that order only, whatever its age, without the lock", async () => {
    h.db.orders = [{ orderNumber: "KOL-20260101-0001" }];
    h.recheck.mockResolvedValue({ kind: "not_paid", stateId: 1, attempts: 0 });
    const r = await sweepPendingPayments({ orderNumber: "KOL-20260101-0001", now: () => NOW });
    const args = h.prisma.order.findMany.mock.calls[0][0 as never] as unknown as {
      where: unknown;
      take: number;
    };
    expect(args.where).toEqual({ orderNumber: "KOL-20260101-0001" });
    expect(args.take).toBe(1);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.prisma.syncState.update).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, checked: 1, stillPending: 1 });
  });
});

describe("the run", () => {
  it("one failure does not stop the others, and every outcome is counted", async () => {
    h.db.orders = ["A", "B", "C", "D", "E"].map((o) => ({ orderNumber: o }));
    h.recheck
      .mockResolvedValueOnce({ kind: "paid", transactionId: "t1", followUps: followUpsOk })
      .mockRejectedValueOnce(new Error("Viva 503"))
      .mockResolvedValueOnce({ kind: "not_paid", stateId: 0, attempts: 0 })
      .mockResolvedValueOnce({ kind: "amount_mismatch", transactionId: "t4", capturedCents: 100, expectedCents: 200 })
      .mockResolvedValueOnce({ kind: "error", error: "timeout" });

    const r = await sweepPendingPayments({ now: () => NOW });

    expect(h.recheck).toHaveBeenCalledTimes(5);
    expect(r).toMatchObject({
      ok: true,
      checked: 5,
      paid: [{ orderNumber: "A", transactionId: "t1", warnings: [] }],
      stillPending: 1,
      mismatches: [{ orderNumber: "D", capturedCents: 100, expectedCents: 200 }],
      errors: [
        { orderNumber: "B", message: "Viva 503" },
        { orderNumber: "E", message: "Η Viva δεν απάντησε: timeout" },
      ],
      truncated: false,
    });
    // Recorded for the sync monitor: errors make it PARTIAL.
    expect(h.db.syncRow).toMatchObject({ lastStatus: "PARTIAL" });
    expect(sweepLogLine(r as never)).toMatch(/^\[payment-sweep\] checked 5, paid 1, pending 1, errors 2/);
  });

  it("passes the paid path's follow-up failures through as warnings", async () => {
    h.db.orders = [{ orderNumber: "A" }];
    h.recheck.mockResolvedValue({
      kind: "paid",
      transactionId: "t1",
      followUps: { ...followUpsOk, erpDocument: { ok: false, stage: "push", error: "SoftOne down" } },
    });
    const r = await sweepPendingPayments({ now: () => NOW });
    expect(r.ok && r.paid[0].warnings[0]).toMatch(/SoftOne down/);
    expect(h.db.syncRow).toMatchObject({ lastStatus: "SUCCESS" });
  });

  it("stops starting new orders when the time budget runs out, and says so", async () => {
    h.db.orders = ["A", "B", "C", "D"].map((o) => ({ orderNumber: o }));
    let t = NOW;
    h.recheck.mockImplementation(async () => {
      t += 20_000; // each check takes 20 s
      return { kind: "not_paid", stateId: 0, attempts: 0 };
    });
    const r = await sweepPendingPayments({ budgetMs: 45_000, now: () => t });
    expect(r).toMatchObject({ ok: true, checked: 3, stillPending: 3, truncated: true });
    expect(h.recheck).toHaveBeenCalledTimes(3);
  });
});

describe("one sweep at a time", () => {
  it("skips when another replica holds the advisory lock", async () => {
    h.db.locked = false;
    const r = await sweepPendingPayments({ now: () => NOW });
    expect(r).toMatchObject({ ok: false, skipped: "already_running" });
    expect(h.prisma.order.findMany).not.toHaveBeenCalled();
  });

  it("skips while another run is marked RUNNING inside its lease", async () => {
    h.db.syncRow = { lastRunAt: new Date(NOW - 60_000), lastStatus: "RUNNING" };
    const r = await sweepPendingPayments({ now: () => NOW });
    expect(r).toMatchObject({ ok: false, skipped: "already_running" });
  });

  it("takes over a RUNNING mark whose lease has expired (a replica that died mid-sweep)", async () => {
    h.db.syncRow = { lastRunAt: new Date(NOW - 10 * 60_000), lastStatus: "RUNNING" };
    const r = await sweepPendingPayments({ now: () => NOW });
    expect(r.ok).toBe(true);
  });

  it("the schedule skips when any replica swept within the gap; an on-demand run does not", async () => {
    h.db.syncRow = { lastRunAt: new Date(NOW - 4 * 60_000), lastStatus: "SUCCESS" };
    expect(await sweepPendingPayments({ minGapMinutes: 10, now: () => NOW })).toMatchObject({
      ok: false,
      skipped: "recently_ran",
    });
    expect(h.prisma.order.findMany).not.toHaveBeenCalled();
    expect((await sweepPendingPayments({ now: () => NOW })).ok).toBe(true);
  });

  it("marks the run RUNNING with its start time, then records the outcome", async () => {
    await sweepPendingPayments({ now: () => NOW });
    expect(h.prisma.syncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { lastRunAt: new Date(NOW), lastStatus: "RUNNING" } }),
    );
    expect(h.db.syncRow).toMatchObject({ lastStatus: "SUCCESS" });
  });

  it("records FAILED and releases the mark when the query itself throws", async () => {
    h.prisma.order.findMany.mockRejectedValueOnce(new Error("db gone"));
    await expect(sweepPendingPayments({ now: () => NOW })).rejects.toThrow("db gone");
    expect(h.db.syncRow).toMatchObject({ lastStatus: "FAILED" });
  });
});

describe("configuration and parameters", () => {
  it("returns not_configured without touching anything when the Viva Merchant ID / API key are missing", async () => {
    h.configured.mockReturnValue(false);
    const r = await sweepPendingPayments({ now: () => NOW });
    expect(r).toMatchObject({ ok: false, skipped: "not_configured" });
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("parses and clamps query parameters", () => {
    expect(parseSweepParams(new URLSearchParams(""))).toEqual({ sinceDays: 10, limit: 50 });
    expect(parseSweepParams(new URLSearchParams("days=0&limit=1000"))).toEqual({ sinceDays: 1, limit: 200 });
    expect(parseSweepParams(new URLSearchParams("days=90&limit=-3"))).toEqual({ sinceDays: 60, limit: 1 });
    expect(parseSweepParams(new URLSearchParams("days=abc&limit=7.9"))).toEqual({ sinceDays: 10, limit: 7 });
    expect(parseSweepParams(new URLSearchParams("order=%20KOL-20261004-0001%20"))).toMatchObject({
      orderNumber: "KOL-20261004-0001",
    });
  });
});
