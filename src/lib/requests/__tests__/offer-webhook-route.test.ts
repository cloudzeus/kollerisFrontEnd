import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { applyOfferWebhook } = vi.hoisted(() => ({
  applyOfferWebhook: vi.fn(async (body: { orderNumber: string; offerVersion: number }) => {
    void body;
    return { status: 200, body: { ok: true } };
  }),
}));
vi.mock("@/lib/requests/service", () => ({ applyOfferWebhook }));

import { signPayload } from "@/lib/webhooks/hdc-signature";
import { POST } from "@/app/api/webhooks/hdctool/order-offer/route";

const SECRET = "test-secret";

function signed(body: unknown, opts: { secret?: string; timestamp?: number; raw?: string } = {}): NextRequest {
  const raw = opts.raw ?? JSON.stringify(body);
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000);
  return new Request("https://kolleris.test/api/webhooks/hdctool/order-offer", {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-hdc-signature": signPayload(raw, opts.secret ?? SECRET, ts),
      "x-hdc-timestamp": String(ts),
    },
  }) as unknown as NextRequest;
}

const valid = {
  orderNumber: "KOL-20261013-0002",
  offerVersion: 1,
  decision: "offer",
  lines: [{ kind: "original", replacesLineId: "L1", mtrl: 101, sku: "A", name: "Πένσα", qty: 2, unitNet: 10, vatRate: 24 }],
  removedLineIds: [],
  expiresAt: "2026-10-16T10:00:00.000Z",
};

beforeEach(() => {
  vi.stubEnv("HDCTOOL_WEBHOOK_SECRET", SECRET);
  applyOfferWebhook.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/hdctool/order-offer", () => {
  it("passes a signed, valid body to the service and answers its result", async () => {
    const res = await POST(signed(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(applyOfferWebhook).toHaveBeenCalledWith(expect.objectContaining({ orderNumber: "KOL-20261013-0002", offerVersion: 1 }));
  });

  it("401 on a wrong secret, a stale timestamp, or a body changed after signing", async () => {
    expect((await POST(signed(valid, { secret: "nope" }))).status).toBe(401);
    expect((await POST(signed(valid, { timestamp: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    const tampered = signed(valid);
    const raw = JSON.stringify({ ...valid, lines: [{ ...valid.lines[0], unitNet: 0 }] });
    const forged = new Request(tampered.url, { method: "POST", body: raw, headers: tampered.headers }) as unknown as NextRequest;
    expect((await POST(forged)).status).toBe(401);
    expect(applyOfferWebhook).not.toHaveBeenCalled();
  });

  it("400 on invalid JSON and on a body outside the contract", async () => {
    expect((await POST(signed(null, { raw: "{not json" }))).status).toBe(400);
    const res = await POST(signed({ ...valid, offerVersion: "1" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid_body" });
    expect(applyOfferWebhook).not.toHaveBeenCalled();
  });

  it("503 when the shared secret is not configured", async () => {
    vi.stubEnv("HDCTOOL_WEBHOOK_SECRET", "");
    expect((await POST(signed(valid))).status).toBe(503);
  });
});
