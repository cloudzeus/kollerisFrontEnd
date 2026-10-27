import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => (await import("../requests/__tests__/request-fakes")).mockModules.prisma());
vi.mock("@/lib/hdctool/client", () => ({ hdctoolRequest: vi.fn() }));

import { buildIntakeBody } from "@/lib/orders/send-to-erp";
import { shippingIntakeBlock } from "@/lib/shipping/intake";

/*
 * EU sales in the HDCtool intake (Task 17 / C4): what the body says about an
 * intra-community order, and — as important — that a Greek order's body has
 * not changed by a single key.
 */

const money = (n: number) => ({ toFixed: (d: number) => n.toFixed(d) });

const dhlQuote = {
  source: "dhl",
  carrier: "DHL",
  productCode: "U",
  netAmount: 31.4,
  quotedAt: "2026-10-27T10:00:00.000Z",
};

function line(over: Record<string, unknown> = {}) {
  return {
    mtrl: 77,
    sku: "KN-1",
    name: "Πένσα",
    brand: "KNIPEX",
    quantity: 2,
    unitNet: money(50),
    discountPercent: money(0),
    offerTitle: null,
    unitGross: money(62),
    vatRate: money(24),
    lineNet: money(100),
    lineGross: money(124),
    weightKg: null,
    ...over,
  };
}

function order(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    orderNumber: "KOL-20261027-0001",
    status: "PENDING_PAYMENT",
    paymentStatus: "PAID",
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
    billCountry: "GR",
    customerType: null,
    vatMode: "standard",
    viesValid: null,
    viesConsultationNumber: null,
    viesCheckedAt: null,
    shippingMethod: "courier",
    notes: null,
    subtotalNet: money(100),
    subtotalGross: money(124),
    shippingNet: money(0),
    shippingGross: money(0),
    paymentFeeNet: money(0),
    paymentFeeGross: money(0),
    vatAmount: money(24),
    totalGross: money(124),
    vivaOrderCode: null,
    vivaTransactionId: null,
    paidAt: null,
    erpTrdr: null,
    createdAt: new Date("2026-10-27T08:00:00Z"),
    requestStatus: null,
    requestedAt: null,
    parentOrderNumber: null,
    requestLines: null,
    offerVersion: null,
    shippingQuote: null,
    lines: [line()],
    ...over,
  } as unknown as Parameters<typeof buildIntakeBody>[0];
}

const exemptDe = (over: Record<string, unknown> = {}) =>
  order({
    shipCountry: "DE",
    shipPostcode: "10115",
    billCountry: "DE",
    wantsInvoice: true,
    companyName: "Muster GmbH",
    vatNumber: "DE123456789",
    customerType: "company",
    vatMode: "intra_eu_exempt",
    viesValid: true,
    viesConsultationNumber: "WAPIAAAA1234",
    viesCheckedAt: new Date("2026-10-27T09:30:00.000Z"),
    shippingMethod: "dhl",
    shippingNet: money(31.4),
    shippingGross: money(31.4),
    subtotalGross: money(100),
    vatAmount: money(0),
    totalGross: money(131.4),
    shippingQuote: dhlQuote,
    ...over,
  });

describe("a Greek order's body is untouched", () => {
  it("adds none of the EU keys (an order placed with EU sales on, billed in Greece, included)", () => {
    const body = buildIntakeBody(order());
    for (const key of [
      "billCountry",
      "customerType",
      "vatMode",
      "viesConsultationNumber",
      "viesCheckedAt",
      "shipping",
    ]) {
      expect(body).not.toHaveProperty(key);
    }
    expect(JSON.stringify(body)).not.toMatch(/vies|vatMode|billCountry|customerType/);
  });

  it("an order from before EU sales (no such columns at all) is the same body", () => {
    const legacy = order() as unknown as Record<string, unknown>;
    for (const key of ["billCountry", "customerType", "vatMode", "viesValid", "viesConsultationNumber", "viesCheckedAt"]) {
      delete legacy[key];
    }
    expect(JSON.stringify(buildIntakeBody(legacy as never))).toBe(JSON.stringify(buildIntakeBody(order())));
  });

  it("a Greek invoice keeps its lines at 24%", () => {
    const body = buildIntakeBody(order({ wantsInvoice: true, vatNumber: "099095556" }));
    expect(body.lines[0].vatRate).toBe("24.00");
    expect(body.vatNumber).toBe("099095556");
  });
});

describe("an intra-community exempt order (DE company, valid VIES)", () => {
  it("carries the EU fields with the VAT number's prefix and VIES proof", () => {
    const body = buildIntakeBody(exemptDe());
    expect(body).toMatchObject({
      billCountry: "DE",
      customerType: "company",
      vatMode: "intra_eu_exempt",
      viesConsultationNumber: "WAPIAAAA1234",
      viesCheckedAt: "2026-10-27T09:30:00.000Z",
      vatNumber: "DE123456789",
      shipCountry: "DE",
    });
  });

  it("sends every line at vatRate 0.00 (whatever was stored), net = gross", () => {
    const body = buildIntakeBody(
      exemptDe({ lines: [line(), line({ sku: "KN-2", vatRate: money(6), unitNet: money(10), quantity: 1, lineNet: money(10), lineGross: money(10.6), unitGross: money(10.6) })] }),
    );
    expect(body.lines.map((l) => l.vatRate)).toEqual(["0.00", "0.00"]);
    expect(body.lines[0]).toMatchObject({ unitNet: "50.00", lineNet: "100.00", lineGross: "100.00", unitGross: "50.00" });
    expect(body.lines[1]).toMatchObject({ lineNet: "10.00", lineGross: "10.00", unitGross: "10.00" });
  });

  it("sends the DHL block at vatRate 0 even though the order stored 24", () => {
    const body = buildIntakeBody(exemptDe());
    expect(body.shipping).toEqual({
      carrier: "DHL",
      productCode: "U",
      netAmount: 31.4,
      vatRate: 0,
      quotedAt: "2026-10-27T10:00:00.000Z",
    });
    expect(Number(body.vatAmount)).toBe(0);
    expect(Number(body.totalGross)).toBe(131.4);
  });
});

describe("EU orders that are charged VAT", () => {
  it("a consumer in Italy: EU fields, standard, lines and DHL stay at 24", () => {
    const body = buildIntakeBody(
      order({
        shipCountry: "IT",
        billCountry: "IT",
        customerType: "individual",
        shippingMethod: "dhl",
        shippingNet: money(31.4),
        shippingQuote: dhlQuote,
      }),
    );
    expect(body).toMatchObject({ billCountry: "IT", customerType: "individual", vatMode: "standard" });
    expect(body).not.toHaveProperty("viesConsultationNumber");
    expect(body.lines[0].vatRate).toBe("24.00");
    expect(body.shipping).toMatchObject({ vatRate: 24 });
  });

  it("a company whose VIES check failed is standard and carries no consultation number", () => {
    const body = buildIntakeBody(
      exemptDe({ vatMode: "standard", viesValid: false, viesConsultationNumber: null, viesCheckedAt: null, vatAmount: money(24) }),
    );
    expect(body).toMatchObject({ vatMode: "standard", customerType: "company", vatNumber: "DE123456789" });
    expect(body).not.toHaveProperty("viesCheckedAt");
    expect(body.lines[0].vatRate).toBe("24.00");
  });
});

describe("shippingIntakeBlock", () => {
  const base = { shipCountry: "DE", shippingMethod: "dhl", shippingNet: 31.4, shippingQuote: dhlQuote };

  it("exempt: vatRate 0", () => {
    expect(shippingIntakeBlock({ ...base, vatMode: "intra_eu_exempt" })).toMatchObject({ vatRate: 0 });
  });

  it("standard or unspecified: 24 as before", () => {
    expect(shippingIntakeBlock({ ...base, vatMode: "standard" })).toMatchObject({ vatRate: 24 });
    expect(shippingIntakeBlock(base)).toMatchObject({ vatRate: 24 });
  });
});
