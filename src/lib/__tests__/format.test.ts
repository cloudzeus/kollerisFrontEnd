import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatNet,
  formatPercent,
  formatPrice,
  grossAmount,
  netAmount,
  savingsOf,
} from "../format";

/*
 * Spelled as an escape, like the one in `format.ts`.
 *
 * Both were a literal " " — an ordinary space — so the suite asserted the exact
 * character that made every product card wrap as "121,78" / "€". A test that
 * encodes the bug is worse than no test: it certifies it.
 */
const NBSP = "\u00A0";

describe("formatMoney", () => {
  it("uses the Greek convention with a non-breaking space before €", () => {
    expect(formatMoney(100, "el")).toBe(`100,00${NBSP}€`);
    expect(formatMoney(0, "el")).toBe(`0,00${NBSP}€`);
  });

  it("groups thousands with a dot", () => {
    expect(formatMoney(1234.56, "el")).toBe(`1.234,56${NBSP}€`);
    expect(formatMoney(1234567.89, "el")).toBe(`1.234.567,89${NBSP}€`);
    expect(formatMoney(999, "el")).toBe(`999,00${NBSP}€`);
  });

  it("handles negatives", () => {
    expect(formatMoney(-45.5, "el")).toBe(`-45,50${NBSP}€`);
  });

  it("rounds half up at the cent", () => {
    expect(formatMoney(1.005, "el")).toBe(`1,01${NBSP}€`);
    expect(formatMoney(2.675, "el")).toBe(`2,68${NBSP}€`);
  });
});

describe("grossAmount", () => {
  it("defaults to 24% VAT", () => {
    expect(grossAmount(100)).toBe(124);
  });

  it("honours reduced rates instead of assuming 24", () => {
    expect(grossAmount(100, { vatRate: 13 })).toBe(113);
    expect(grossAmount(100, { vatRate: 6 })).toBe(106);
  });

  it("applies the partner tier before VAT", () => {
    expect(grossAmount(100, { partnerFactor: 0.88 })).toBe(109.12);
  });
});

describe("netAmount", () => {
  it("is the partner-adjusted net, with no VAT applied", () => {
    expect(netAmount(100)).toBe(100);
    expect(netAmount(100, { partnerFactor: 0.88 })).toBe(88);
  });

  it("ignores vatRate entirely — net is net", () => {
    expect(netAmount(100, { vatRate: 13 })).toBe(100);
  });
});

describe("formatPrice", () => {
  it("is always VAT-inclusive — there is no net/gross toggle", () => {
    expect(formatPrice(100, "el")).toBe(`124,00${NBSP}€`);
    expect(formatPrice(100, "el", { vatRate: 13 })).toBe(`113,00${NBSP}€`);
    expect(formatPrice(100, "el", { partnerFactor: 0.88 })).toBe(`109,12${NBSP}€`);
  });

  it("matches a real product from the live API (net 63.92, VAT 24%)", () => {
    expect(formatPrice(63.92, "el", { vatRate: 24 })).toBe(`79,26${NBSP}€`);
  });
});

describe("formatNet", () => {
  it("stays net — for ERP payloads and /admin only", () => {
    expect(formatNet(100, "el")).toBe(`100,00${NBSP}€`);
    expect(formatNet(100, "el", { partnerFactor: 0.88 })).toBe(`88,00${NBSP}€`);
  });
});

describe("savingsOf", () => {
  it("returns null when there is no real discount", () => {
    expect(savingsOf(100, 100, "el")).toBeNull();
    expect(savingsOf(80, 100, "el")).toBeNull();
  });

  it("computes the saving gross, like every other displayed price", () => {
    expect(savingsOf(100, 88, "el")).toEqual({
      amount: 14.88,
      percent: 12,
      formatted: `14,88${NBSP}€`,
    });
  });

  it("uses the product's own VAT rate", () => {
    expect(savingsOf(100, 88, "el", { vatRate: 13 })?.amount).toBe(13.56);
  });
});

describe("formatMoney across the three languages", () => {
  /*
   * The reason this function takes a locale at all.
   *
   * Greek and Italian agree; English swaps both separators and moves the symbol
   * to the front, so the Greek rendering of €1,234.56 reads to an English
   * customer as one euro and change.
   */
  it("writes Italian the same way as Greek", () => {
    expect(formatMoney(1234.56, "it")).toBe(`1.234,56${NBSP}€`);
  });

  it("writes English with the symbol first and the separators swapped", () => {
    expect(formatMoney(1234.56, "en")).toBe("€1,234.56");
    expect(formatMoney(1234567.89, "en")).toBe("€1,234,567.89");
    expect(formatMoney(999, "en")).toBe("€999.00");
  });

  it("keeps the minus outside the symbol in English", () => {
    expect(formatMoney(-45.5, "en")).toBe("-€45.50");
  });

  it("rounds identically whatever the language", () => {
    expect(formatMoney(2.675, "en")).toBe("€2.68");
    expect(formatMoney(2.675, "it")).toBe(`2,68${NBSP}€`);
  });

  it("carries the locale through formatPrice and savingsOf", () => {
    expect(formatPrice(100, "en")).toBe("€124.00");
    expect(savingsOf(100, 88, "en")?.formatted).toBe("€14.88");
  });
});

describe("formatPercent", () => {
  it("renders a discount chip", () => {
    expect(formatPercent(12)).toBe("-12%");
    expect(formatPercent(12.4)).toBe("-12%");
  });
});

describe("the space before\u00A0€", () => {
  it("is a non-breaking space, not an ordinary one", () => {
    // A plain space here is why product cards wrapped as "121,78" / "€".
    expect(formatMoney(121.78, "el")).toBe("121,78 €");
    expect(formatMoney(121.78, "el")).not.toContain(" €");
  });

  it("holds through grouping and negatives", () => {
    expect(formatMoney(1234.5, "el")).toBe("1.234,50 €");
    expect(formatMoney(-42, "el")).toBe("-42,00 €");
  });
});
