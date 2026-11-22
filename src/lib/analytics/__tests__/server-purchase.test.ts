import { describe, expect, it } from "vitest";
import { ga4PurchaseBody, orderClientId, type PurchaseOrder } from "@/lib/analytics/server-purchase";
import type { OrderAttribution } from "@/lib/analytics/attribution";

const order: PurchaseOrder = {
  orderNumber: "KOL-20261121-0001", subtotalNet: 33.85, vatAmount: 8.12, shippingGross: 0,
  email: "a@b.gr", phone: "", firstName: "", lastName: "", shipCity: "", shipPostcode: "", shipCountry: "GR",
  paidAt: new Date("2026-11-21T05:20:00Z"), attribution: null,
  lines: [{ sku: "X1", mtrl: 1, name: "n", brand: null, unitNet: 33.85, discountPercent: 0, quantity: 1 }],
};

describe("server GA4 purchase", () => {
  it("uses the browser client_id when there is one", () => {
    const a: OrderAttribution = { consent: "granted", gaClientId: "110314627.1795331079" };
    expect(ga4PurchaseBody(order, a).client_id).toBe("110314627.1795331079");
  });

  it("falls back to a stable client_id from the order", () => {
    const body = ga4PurchaseBody(order, { consent: "granted" });
    expect(body.client_id).toMatch(/^\d+\.\d+$/);
    expect(body.client_id).toBe(orderClientId(order.orderNumber, order.paidAt));
    expect(orderClientId("KOL-20261121-0002", order.paidAt)).not.toBe(body.client_id);
  });
});
