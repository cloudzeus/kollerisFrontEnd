import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sweep: vi.fn(), configured: vi.fn(() => true) }));
vi.mock("@/lib/payment/viva", () => ({ isVivaBasicConfigured: h.configured }));
vi.mock("@/lib/payment/payment-sweep", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/payment/payment-sweep")>();
  return { sweepLogLine: real.sweepLogLine, sweepPendingPayments: h.sweep };
});
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/payment/confirm-payment", () => ({ recheckVivaPayment: vi.fn() }));

import {
  minGapMinutes,
  paymentSweepConfig,
  runScheduledSweep,
  startPaymentSweepSchedule,
  stopPaymentSweepSchedule,
} from "@/lib/payment/payment-sweep-schedule";

const PROD = { NODE_ENV: "production" };

beforeEach(() => {
  h.sweep.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  stopPaymentSweepSchedule();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PAYMENT_SWEEP_ENABLED / PAYMENT_SWEEP_INTERVAL_MIN", () => {
  it("is on by default in production when Viva's Merchant ID / API key are set", () => {
    expect(paymentSweepConfig(PROD, true)).toEqual({ enabled: true, intervalMin: 15 });
  });

  it("is off by default outside production, and on when asked", () => {
    expect(paymentSweepConfig({ NODE_ENV: "development" }, true).enabled).toBe(false);
    expect(paymentSweepConfig({ NODE_ENV: "development", PAYMENT_SWEEP_ENABLED: "on" }, true).enabled).toBe(true);
  });

  it("'off' disables it even in production", () => {
    expect(paymentSweepConfig({ ...PROD, PAYMENT_SWEEP_ENABLED: "off" }, true).enabled).toBe(false);
    expect(paymentSweepConfig({ ...PROD, PAYMENT_SWEEP_ENABLED: "0" }, true).enabled).toBe(false);
  });

  it("never runs without the Viva credentials, even when forced on", () => {
    expect(paymentSweepConfig({ ...PROD, PAYMENT_SWEEP_ENABLED: "on" }, false).enabled).toBe(false);
  });

  it("clamps the interval to 5–120 minutes", () => {
    expect(paymentSweepConfig({ ...PROD, PAYMENT_SWEEP_INTERVAL_MIN: "1" }, true)).toEqual({ enabled: true, intervalMin: 5 });
    expect(paymentSweepConfig({ ...PROD, PAYMENT_SWEEP_INTERVAL_MIN: "999" }, true)).toEqual({ enabled: true, intervalMin: 120 });
    expect(paymentSweepConfig({ ...PROD, PAYMENT_SWEEP_INTERVAL_MIN: "abc" }, true)).toEqual({ enabled: true, intervalMin: 15 });
  });

  it("the cross-replica gap never blocks a replica's own next tick", () => {
    expect(minGapMinutes(15)).toBe(10);
    expect(minGapMinutes(5)).toBe(3);
    expect(minGapMinutes(120)).toBe(10);
  });
});

describe("startPaymentSweepSchedule", () => {
  it("starts once: a second register() or an HMR re-run does not arm a second timer", () => {
    const run = vi.fn(async () => {});
    expect(startPaymentSweepSchedule({ env: PROD, vivaConfigured: true, run }).started).toBe(true);
    expect(startPaymentSweepSchedule({ env: PROD, vivaConfigured: true, run })).toEqual({
      started: false,
      reason: "already started",
    });
  });

  it("does not start during next build, nor when disabled", () => {
    const run = vi.fn(async () => {});
    expect(
      startPaymentSweepSchedule({ env: { ...PROD, NEXT_PHASE: "phase-production-build" }, vivaConfigured: true, run }).started,
    ).toBe(false);
    expect(startPaymentSweepSchedule({ env: { ...PROD, PAYMENT_SWEEP_ENABLED: "off" }, vivaConfigured: true, run }).started).toBe(false);
    expect(startPaymentSweepSchedule({ env: { NODE_ENV: "development" }, vivaConfigured: true, run }).started).toBe(false);
  });

  it("first runs 1–3 minutes after boot, then every interval with ±10% jitter", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => {});
    startPaymentSweepSchedule({ env: PROD, vivaConfigured: true, run, random: () => 0.5 });

    await vi.advanceTimersByTimeAsync(119_999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); // 60 s + 0.5 × 120 s
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(15);

    await vi.advanceTimersByTimeAsync(15 * 60_000 - 1); // jitter 0.9 + 0.5×0.2 = 1.0
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps ticking after a run that fails", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => {
      throw new Error("boom");
    });
    startPaymentSweepSchedule({ env: PROD, vivaConfigured: true, run, random: () => 0 });
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(15 * 60_000 * 0.9);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("runScheduledSweep", () => {
  const report = {
    ok: true as const,
    checked: 3,
    paid: [{ orderNumber: "KOL-1", transactionId: "t", warnings: [] }],
    stillPending: 2,
    mismatches: [],
    errors: [],
    truncated: false,
    durationMs: 10,
  };

  it("logs one line per run", async () => {
    h.sweep.mockResolvedValue(report);
    await runScheduledSweep(15);
    expect(h.sweep).toHaveBeenCalledWith({ minGapMinutes: 10, actor: "payment-sweep" });
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.log).mock.calls[0][0]).toBe(
      "[payment-sweep] checked 3, paid 1, pending 2, errors 0 (KOL-1)",
    );
  });

  it("is silent when skipped, unless debugging", async () => {
    h.sweep.mockResolvedValue({ ok: false, skipped: "recently_ran", message: "" });
    await runScheduledSweep(15);
    expect(console.log).not.toHaveBeenCalled();
    expect(console.debug).not.toHaveBeenCalled();
    await runScheduledSweep(15, true);
    expect(console.debug).toHaveBeenCalledWith("[payment-sweep] skipped: recently_ran");
  });

  it("never throws out of the timer", async () => {
    h.sweep.mockRejectedValue(new Error("db down"));
    await expect(runScheduledSweep(15)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
