import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { signPayload } from "@/lib/webhooks/hdc-signature";
import { DHL_TRACKING_BASE, acsTrackingUrl, dhlTrackingUrl, isDhlShipment, trackingFor } from "@/lib/shipping/tracking";

/**
 * HDCtool's `order-shipped` webhook with DHL (docs/dhl-express.md §3): the body
 * may carry `carrier: "DHL"` and `trackingUrl`, `voucherNo` is then the AWB.
 * An ACS body has no carrier field and must take exactly the old path.
 */

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  sendShippedEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findUnique: mocks.findUnique, update: mocks.update } },
}));
vi.mock("@/lib/mail/order-shipped-email", () => ({ sendShippedEmail: mocks.sendShippedEmail }));

const { POST } = await import("@/app/api/webhooks/hdctool/order-shipped/route");

const SECRET = "test-secret";

function signed(body: unknown): NextRequest {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  return new Request("https://shop.test/api/webhooks/hdctool/order-shipped", {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-hdc-signature": signPayload(raw, SECRET, ts),
      "x-hdc-timestamp": String(ts),
    },
  }) as unknown as NextRequest;
}

const dhlQuote = { source: "dhl", carrier: "DHL", productCode: "U", etaDays: "2–3" };

beforeEach(() => {
  vi.stubEnv("HDCTOOL_WEBHOOK_SECRET", SECRET);
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.findUnique.mockResolvedValue({
    id: "o1",
    orderNumber: "X-1",
    status: "CONFIRMED",
    acsVoucherNo: null,
    shippingQuote: dhlQuote,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST order-shipped", () => {
  it("ACS (no carrier field): the same write as before — no shippingQuote touched", async () => {
    mocks.findUnique.mockResolvedValue({ id: "o1", orderNumber: "X-1", status: "CONFIRMED", acsVoucherNo: null, shippingQuote: { source: "acs" } });
    const res = await POST(signed({ orderNumber: "X-1", voucherNo: "9805563515", pickupDate: "2026-10-14" }));
    expect(res.status).toBe(200);
    const data = mocks.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("shippingQuote");
    expect(data).toMatchObject({ acsVoucherNo: "9805563515", acsPickupDate: "2026-10-14", status: "SHIPPED" });
    expect(data.history.create.note).toBe("ACS voucher 9805563515");
    expect(mocks.sendShippedEmail).toHaveBeenCalledWith("X-1", "9805563515");
  });

  it("DHL: keeps the AWB and stores carrier + trackingUrl beside the quote", async () => {
    const trackingUrl = "https://www.dhl.com/gr-el/home/tracking/tracking-express.html?submit=1&tracking-id=1234567890";
    const res = await POST(signed({ orderNumber: "X-1", voucherNo: "1234567890", carrier: "DHL", trackingUrl }));
    expect(res.status).toBe(200);
    const data = mocks.update.mock.calls[0][0].data;
    expect(data.acsVoucherNo).toBe("1234567890");
    expect(data.shippingQuote).toMatchObject({
      ...dhlQuote,
      shipment: { carrier: "DHL", awb: "1234567890", trackingUrl },
    });
    expect(data.history.create.note).toBe("DHL AWB 1234567890");
  });

  it("DHL without a trackingUrl falls back to DHL's public tracker", async () => {
    await POST(signed({ orderNumber: "X-1", voucherNo: "1234567890", carrier: "DHL" }));
    expect(mocks.update.mock.calls[0][0].data.shippingQuote.shipment.trackingUrl).toBe(
      `${DHL_TRACKING_BASE}1234567890`,
    );
  });

  it.each([
    ["an unknown carrier", { carrier: "UPS" }],
    ["a non-https trackingUrl", { carrier: "DHL", trackingUrl: "javascript:alert(1)" }],
  ])("refuses %s with 400 and writes nothing", async (_label, extra) => {
    const res = await POST(signed({ orderNumber: "X-1", voucherNo: "1", ...extra }));
    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("still says what it always said when orderNumber or voucherNo is missing", async () => {
    const res = await POST(signed({ orderNumber: "X-1" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "orderNumber και voucherNo απαιτούνται" });
  });
});

describe("trackingFor", () => {
  it("ACS order → ACS link, as before", () => {
    expect(trackingFor({ shippingMethod: "courier", shippingQuote: { source: "acs" } }, "98")).toEqual({
      carrier: "ACS",
      courier: "ACS Courier",
      url: acsTrackingUrl("98"),
    });
  });

  it("DHL order → the URL HDCtool sent", () => {
    const order = {
      shippingMethod: "dhl",
      shippingQuote: { ...dhlQuote, shipment: { carrier: "DHL", awb: "12", trackingUrl: "https://dhl.example/t/12", at: "" } },
    };
    expect(trackingFor(order, "12")).toEqual({ carrier: "DHL", courier: "DHL Express", url: "https://dhl.example/t/12" });
  });

  it("DHL order without a stored URL → DHL's public tracker", () => {
    expect(trackingFor({ shippingMethod: "dhl", shippingQuote: dhlQuote }, "12").url).toBe(dhlTrackingUrl("12"));
    expect(isDhlShipment({ shippingMethod: "courier", shippingQuote: dhlQuote })).toBe(true);
    expect(isDhlShipment({ shippingMethod: "courier", shippingQuote: null })).toBe(false);
  });
});
