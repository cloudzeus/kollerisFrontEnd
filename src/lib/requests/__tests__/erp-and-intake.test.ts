import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => (await import("./request-fakes")).mockModules.prisma());
const { hdctoolRequest } = vi.hoisted(() => ({
  hdctoolRequest: vi.fn(async (endpoint: string, body?: unknown) => {
    void body;
    if (endpoint.endsWith("/push")) return { success: true, softOneOrderId: 123, fincode: "ΠΑΡΚ000123" };
    return { success: true };
  }),
}));
vi.mock("@/lib/hdctool/client", () => ({ hdctoolRequest }));

import { db, resetFakes, seedRequest } from "./request-fakes";
import { buildIntakeBody, sendOrderToErp, syncRequestToHdctool } from "@/lib/orders/send-to-erp";

beforeEach(() => {
  resetFakes();
  hdctoolRequest.mockClear();
});

const money = (n: number) => ({ toFixed: (d: number) => n.toFixed(d) });

function intakeOrder(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    orderNumber: "KOL-20261013-0001",
    status: "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    paymentMethod: "card",
    vivaPaymentMethodId: null,
    email: "a@b.test",
    phone: "1",
    firstName: "A",
    lastName: "B",
    shipLine1: "x",
    shipLine2: null,
    shipCity: "y",
    shipPostcode: "18545",
    shipRegion: null,
    shipCountry: "GR",
    wantsInvoice: false,
    companyName: null,
    vatNumber: null,
    taxOffice: null,
    companyTrade: null,
    billLine1: null,
    billCity: null,
    billPostcode: null,
    shippingMethod: "courier",
    notes: null,
    subtotalNet: money(10),
    subtotalGross: money(12.4),
    shippingNet: money(0),
    shippingGross: money(0),
    paymentFeeNet: money(0),
    paymentFeeGross: money(0),
    vatAmount: money(2.4),
    totalGross: money(12.4),
    vivaOrderCode: null,
    vivaTransactionId: null,
    paidAt: null,
    erpTrdr: null,
    createdAt: new Date("2026-10-13T08:00:00Z"),
    requestStatus: null,
    requestedAt: null,
    parentOrderNumber: null,
    requestLines: null,
    offerVersion: null,
    lines: [],
    ...over,
  } as unknown as Parameters<typeof buildIntakeBody>[0];
}

describe("intake body (contract §3)", () => {
  it("an ordinary order carries no `request` key — existing intake unchanged", () => {
    expect(buildIntakeBody(intakeOrder())).not.toHaveProperty("request");
  });

  it("a request carries status, time, parent, the original lines, version and note", () => {
    const body = buildIntakeBody(
      intakeOrder({
        requestStatus: "ACCEPTED",
        requestedAt: new Date("2026-10-13T08:00:00Z"),
        parentOrderNumber: "KOL-20261013-0001",
        offerVersion: 2,
        notes: "  Πριν τις 10 ",
        requestLines: {
          v: 1,
          locale: "el",
          lines: [{ lineId: "L1", productId: "p", mtrl: 101, sku: "A", name: "Πένσα", brand: null, imageUrl: null, qty: 2, unitNet: 10, vatRate: 24, stockAtRequest: 0 }],
        },
      }),
    );
    expect(body.request).toEqual({
      status: "ACCEPTED",
      requestedAt: "2026-10-13T08:00:00.000Z",
      parentOrderNumber: "KOL-20261013-0001",
      lines: [{ lineId: "L1", mtrl: 101, sku: "A", name: "Πένσα", qty: 2, unitNet: 10, vatRate: 24, stockAtRequest: 0 }],
      offerVersion: 2,
      customerNote: "Πριν τις 10",
    });
  });
});

describe("a request is never a SoftOne document while unpaid", () => {
  it.each(["REQUESTED", "OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "REJECTED"])(
    "unpaid %s → refused, nothing posted",
    async (status) => {
      seedRequest({ requestStatus: status, erpFindoc: null });
      const result = await sendOrderToErp("KOL-20261013-0002");
      expect(result.ok).toBe(false);
      expect(hdctoolRequest).not.toHaveBeenCalled();
    },
  );

  it.each(["REQUESTED", "OFFERED", "DECLINED", "EXPIRED", "REJECTED"])(
    "even marked PAID, a %s request is refused",
    async (status) => {
      seedRequest({ requestStatus: status, paymentStatus: "PAID", erpFindoc: null });
      const result = await sendOrderToErp("KOL-20261013-0002");
      expect(result).toMatchObject({ ok: false, stage: "order" });
      expect(hdctoolRequest).not.toHaveBeenCalled();
    },
  );

  it("an ACCEPTED and PAID request goes through like any paid order", async () => {
    seedRequest({ requestStatus: "ACCEPTED", paymentStatus: "PAID", erpFindoc: null, erpTrdr: null, erpFincode: null });
    const result = await sendOrderToErp("KOL-20261013-0002");
    expect(result).toMatchObject({ ok: true, findoc: 123 });
    expect(hdctoolRequest.mock.calls.map((c) => c[0])).toEqual([
      "/api/public/orders",
      "/api/public/orders/KOL-20261013-0002/push",
    ]);
  });
});

describe("syncRequestToHdctool — intake only, on every state change", () => {
  it("posts the intake with the request block and never the push", async () => {
    seedRequest();
    // The fake order has no Decimal money columns; give it the shape the body builder reads.
    Object.assign(db.orders[0], {
      subtotalNet: money(40), subtotalGross: money(49.6), shippingNet: money(0), shippingGross: money(0),
      paymentFeeNet: money(0), paymentFeeGross: money(0), vatAmount: money(9.6), totalGross: money(49.6),
      createdAt: new Date("2026-10-13T08:00:00Z"),
    });
    db.lines.length = 0;
    expect(await syncRequestToHdctool("KOL-20261013-0002")).toEqual({ ok: true });
    expect(hdctoolRequest).toHaveBeenCalledTimes(1);
    const [endpoint, body] = hdctoolRequest.mock.calls[0] as [string, { request: { status: string; lines: unknown[] } }];
    expect(endpoint).toBe("/api/public/orders");
    expect(body.request.status).toBe("REQUESTED");
    expect(body.request.lines).toHaveLength(2);
  });

  it("refuses an ordinary order", async () => {
    seedRequest({ requestStatus: null });
    expect(await syncRequestToHdctool("KOL-20261013-0002")).toMatchObject({ ok: false });
    expect(hdctoolRequest).not.toHaveBeenCalled();
  });
});
