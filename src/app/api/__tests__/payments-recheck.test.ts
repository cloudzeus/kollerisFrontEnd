import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sweep = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payment/payment-sweep", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/payment/payment-sweep")>();
  return { ...real, sweepPendingPayments: sweep };
});
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/payment/viva", () => ({ isVivaBasicConfigured: () => true }));
vi.mock("@/lib/payment/confirm-payment", () => ({ recheckVivaPayment: vi.fn() }));

import { GET, POST } from "@/app/api/payments/recheck/route";

const report = {
  ok: true,
  checked: 0,
  paid: [],
  stillPending: 0,
  mismatches: [],
  errors: [],
  truncated: false,
  durationMs: 1,
};

function req(query = "", auth?: string, method = "GET") {
  return new NextRequest(`https://kolleris.com/api/payments/recheck${query}`, {
    method,
    headers: auth ? { authorization: auth } : {},
  });
}

const saved = process.env.CRON_SECRET;
beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  sweep.mockReset();
  sweep.mockResolvedValue(report);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  process.env.CRON_SECRET = saved;
  vi.restoreAllMocks();
});

describe("/api/payments/recheck", () => {
  it("is 503 when CRON_SECRET is not set, and runs nothing", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("", "Bearer s3cret"));
    expect(res.status).toBe(503);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("is 401 with no bearer or a wrong one", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("", "Bearer nope"))).status).toBe(401);
    expect((await GET(req("", "Bearer s3cret-but-longer"))).status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("runs the sweep with clamped parameters and returns the report", async () => {
    const res = await GET(req("?days=500&limit=0", "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(report);
    expect(sweep).toHaveBeenCalledWith(
      expect.objectContaining({ sinceDays: 60, limit: 1, budgetMs: 40_000, actor: "payment-sweep:api" }),
    );
  });

  it("checks a single order on POST too", async () => {
    await POST(req("?order=KOL-20261004-0001", "Bearer s3cret", "POST"));
    expect(sweep).toHaveBeenCalledWith(expect.objectContaining({ orderNumber: "KOL-20261004-0001" }));
  });

  it("passes a skipped result through as 200", async () => {
    sweep.mockResolvedValue({ ok: false, skipped: "already_running", message: "x" });
    const res = await GET(req("", "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: "already_running" });
  });
});
