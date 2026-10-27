import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A split cart under EU sales: the «pay now» figure is priced with the VAT
 * mode the page resolved (net when exempt), an abroad quote outage reads as
 * no price, and the confirmation says «χωρίς ΦΠΑ» for an exempt order.
 */

const computeTotals = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cart/cart", () => ({ computeTotals }));

const { checkoutBreakdown } = await import("@/lib/requests/checkout-breakdown");

const line = (id: string, inStock: boolean) => ({
  id,
  productId: id,
  quantity: 1,
  lineNet: 100,
  lineGross: 124,
  inStock,
  availableQty: inStock ? 5 : 0,
  availability: inStock ? "stock" : "order",
});

const totals = (over: Record<string, unknown> = {}) => ({
  subtotalNet: 100,
  subtotalGross: 100,
  shippingNet: 31.4,
  shippingGross: 31.4,
  paymentFeeGross: 0,
  vatAmount: 0,
  totalGross: 131.4,
  unserviceable: false,
  freeShippingReached: false,
  ...over,
});

beforeEach(() => computeTotals.mockReset());

describe("checkoutBreakdown with EU sales", () => {
  it("passes the VAT mode to computeTotals: the «now» part is the net when exempt", async () => {
    computeTotals.mockResolvedValue(totals());
    const breakdown = await checkoutBreakdown({
      lines: [line("a", true), line("b", false)] as never,
      cartTotals: totals() as never,
      shippingMethod: "dhl",
      paymentMethod: "card",
      postcode: "10117",
      destination: { country: "DE", city: "Berlin" },
      vatMode: "intra_eu_exempt",
    });
    expect(computeTotals.mock.calls[0][5]).toEqual({ vatMode: "intra_eu_exempt" });
    expect(breakdown?.split?.now.totalGross).toBe(131.4);
  });

  it("without a VAT mode the call is today's", async () => {
    computeTotals.mockResolvedValue(totals());
    await checkoutBreakdown({
      lines: [line("a", true), line("b", false)] as never,
      cartTotals: totals() as never,
      shippingMethod: "courier",
      paymentMethod: "card",
    });
    expect(computeTotals.mock.calls[0][5]).toEqual({});
  });

  it("an abroad quote outage is «no price» on the now part", async () => {
    computeTotals.mockResolvedValue(totals({ shippingNet: 0, shippingGross: 0, quoteUnavailable: true }));
    const breakdown = await checkoutBreakdown({
      lines: [line("a", true), line("b", false)] as never,
      cartTotals: totals() as never,
      shippingMethod: "dhl",
      paymentMethod: "card",
      destination: { country: "DE", city: "Berlin" },
      vatMode: "standard",
    });
    expect(breakdown?.split?.now.unserviceable).toBe(true);
  });
});

describe("the words", () => {
  it.each(["el", "en", "it"])("%s has split_now_line_exempt without «με ΦΠΑ»", (locale) => {
    const m = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8"));
    const text: string = m.epibebaiosi.page.split_now_line_exempt;
    expect(text).toContain("{total}");
    expect(text).not.toMatch(/με ΦΠΑ|incl\. VAT|IVA inclusa/);
  });

  it("the form never says «δωρεάν» for the now part abroad", () => {
    const src = readFileSync("src/components/checkout/CheckoutForm.tsx", "utf8");
    expect(src).toMatch(/splitNow\.shippingGross === 0 && !splitNow\.unserviceable && !abroad/);
  });
});
