import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDhlQuoteCache } from "@/lib/shipping/courier-quote";

/**
 * VAT mode in the totals (EU sales): `standard` is today's arithmetic bit for
 * bit; `intra_eu_exempt` strips VAT from lines, shipping and the payment fee.
 * Free shipping (net ≥ €150) is a Greek promise and never applies abroad.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: request,
}));
// The shop has no fee-bearing payment method today; a test-only one proves the
// fee loses its VAT too.
vi.mock("@/lib/cart/options", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/cart/options")>();
  return {
    ...real,
    PAYMENT_METHODS: [
      ...real.PAYMENT_METHODS,
      { id: "fee", label: "Fee", feeNet: 2.5, partnerOnly: false },
    ],
  };
});

const { computeTotals } = await import("@/lib/cart/cart");

type Lines = Parameters<typeof computeTotals>[0];
const line = (lineNet: number, vatRate: number, extra: object = {}) => ({
  quantity: 1,
  weight: 1,
  width: 10,
  length: 10,
  height: 10,
  lineNet,
  lineGross: Math.round(lineNet * (1 + vatRate / 100) * 100) / 100,
  unitListNet: null,
  vatRate,
  ...extra,
});

// Not in the real PAYMENT_METHODS type; present via the mock above.
const FEE = "fee" as unknown as "card";

const small = [line(60, 24), line(40, 13)] as unknown as Lines; // net 100: under the threshold
const big = [line(300, 24), line(100, 13)] as unknown as Lines; // net 400

const acs = (totalNet: number) => ({
  success: true,
  quote: { stationId: "Π", area: "", remote: false, basicNet: totalNet, extrasNet: 0, totalNet, vatAmount: 0, totalGross: 0, weightKg: 1 },
});
const dhl = {
  success: true,
  carrier: "DHL",
  productCode: "U",
  productName: "EXPRESS WORLDWIDE EU",
  netAmount: 31.4,
  currency: "EUR",
  transitDays: 3,
};

beforeEach(() => {
  request.mockReset();
  clearDhlQuoteCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("computeTotals vatMode", () => {
  it("standard is the default and changes nothing", async () => {
    request.mockResolvedValue(acs(5));
    const implicit = await computeTotals(small, "courier", FEE, "18545");
    const explicit = await computeTotals(small, "courier", FEE, "18545", undefined, { vatMode: "standard" });
    expect(explicit).toEqual(implicit);
    expect(implicit).toMatchObject({
      subtotalNet: 100,
      subtotalGross: 119.6,
      shippingNet: 5,
      shippingGross: 6.2,
      paymentFeeNet: 2.5,
      paymentFeeGross: 3.1,
      totalGross: 128.9,
      vatAmount: 21.4,
    });
  });

  it("exempt: every gross equals its net, VAT is zero (24% and 13% lines, shipping, fee)", async () => {
    request.mockResolvedValue(acs(5));
    const t = await computeTotals(small, "courier", FEE, "18545", undefined, { vatMode: "intra_eu_exempt" });
    expect(t.subtotalGross).toBe(t.subtotalNet);
    expect(t.subtotalNet).toBe(100);
    expect(t.shippingNet).toBe(5);
    expect(t.shippingGross).toBe(5);
    expect(t.paymentFeeNet).toBe(2.5);
    expect(t.paymentFeeGross).toBe(2.5);
    expect(t.totalGross).toBe(107.5);
    expect(t.vatAmount).toBe(0);
  });

  it("exempt: savings are counted on net prices", async () => {
    const discounted = [line(80, 24, { unitListNet: 100 })] as unknown as Lines;
    const t = await computeTotals(discounted, "pickup", "card", "18545", undefined, { vatMode: "intra_eu_exempt" });
    expect(t.savingsGross).toBe(20);
  });

  it("an explicit shipping charge replaces the quote and carries its own VAT rate", async () => {
    const std = await computeTotals(small, "dhl", "card", "10115", { country: "DE" }, {
      shipping: { net: 20, vatRate: 19 },
    });
    expect(request).not.toHaveBeenCalled();
    expect(std).toMatchObject({ shippingNet: 20, shippingGross: 23.8 });

    const ex = await computeTotals(small, "dhl", "card", "10115", { country: "DE" }, {
      vatMode: "intra_eu_exempt",
      shipping: { net: 20, vatRate: 19 },
    });
    expect(ex).toMatchObject({ shippingNet: 20, shippingGross: 20, vatAmount: 0 });
  });

  it("null shipping means no override", async () => {
    request.mockResolvedValue(acs(5));
    const t = await computeTotals(small, "courier", "card", "18545", undefined, { shipping: null });
    expect(t.shippingNet).toBe(5);
  });
});

describe("free shipping is Greek only", () => {
  it("Greece over €150 net is free, in both modes", async () => {
    request.mockResolvedValue(acs(5));
    for (const vatMode of ["standard", "intra_eu_exempt"] as const) {
      const t = await computeTotals(big, "courier", "card", "18545", undefined, { vatMode });
      expect(t.shippingNet).toBe(0);
      expect(t.freeShippingReached).toBe(true);
    }
  });

  it("the country option works without a destination, and defaults to GR", async () => {
    request.mockResolvedValue(dhl);
    const gr = await computeTotals(big, "courier", "card", "18545", undefined, { country: "GR" });
    expect(gr.shippingNet).toBe(0);
    request.mockResolvedValue(dhl);
    const de = await computeTotals(big, "dhl", "card", "10115", undefined, { country: "DE" });
    expect(de.shippingNet).toBe(31.4);
  });

  it("a DE cart with net €400 still pays DHL shipping, standard and exempt", async () => {
    request.mockResolvedValue(dhl);
    const std = await computeTotals(big, "dhl", "card", "10115", { country: "DE", city: "Berlin" });
    expect(std.shippingNet).toBe(31.4);
    expect(std.shippingGross).toBe(38.94);
    expect(std.freeShippingReached).toBe(false);

    clearDhlQuoteCache();
    const ex = await computeTotals(big, "dhl", "card", "10115", { country: "DE", city: "Berlin" }, {
      vatMode: "intra_eu_exempt",
    });
    expect(ex.shippingNet).toBe(31.4);
    expect(ex.shippingGross).toBe(31.4);
    expect(ex.vatAmount).toBe(0);
    expect(ex.freeShippingReached).toBe(false);
  });

  it("even a courier id left over in the cart is not free abroad, or in Cyprus", async () => {
    request.mockResolvedValue(acs(5));
    const cy = await computeTotals(big, "courier", "card", "1010", { country: "CY" });
    expect(cy.shippingNet).toBe(5);
  });
});
