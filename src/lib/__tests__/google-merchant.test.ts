import { describe, expect, it } from "vitest";
import { feedPrices, isValidGtin } from "../feeds/google-merchant";

/**
 * A wrong GTIN is a disapproval; an absent one is fine, because every product
 * in this catalogue carries a brand and an MPN. So the check digit is the thing
 * that decides whether the field ships at all, and it is worth testing rather
 * than trusting.
 */
describe("GTIN validation", () => {
  it("accepts real codes from the catalogue", () => {
    // Taken from live rows: Bosch, Milwaukee, Facom.
    for (const code of ["3165140485913", "4058546349189", "3165140147781", "3662424034879"]) {
      expect(isValidGtin(code), code).toBe(true);
    }
  });

  it("rejects a code with the wrong check digit", () => {
    // Same Bosch code, last digit moved by one.
    expect(isValidGtin("3165140485914")).toBe(false);
  });

  it("rejects lengths that are not a GTIN", () => {
    expect(isValidGtin("12345")).toBe(false);
    expect(isValidGtin("316514048591")).toBe(false); // 12 digits, bad check
    expect(isValidGtin("")).toBe(false);
    expect(isValidGtin(null)).toBe(false);
  });

  it("ignores separators rather than failing on them", () => {
    expect(isValidGtin("3165140485913")).toBe(true);
    expect(isValidGtin("3-165140-485913")).toBe(true);
    expect(isValidGtin(" 3165140485913 ")).toBe(true);
  });

  it("accepts a valid EAN-8", () => {
    expect(isValidGtin("96385074")).toBe(true);
  });
});

describe("feed prices", () => {
  it("strikes the frozen regular price while an HDCtool offer runs", () => {
    // GEDORE 6093660 on 2026-11-22: 314,17 € → 255,00 € on the offer page.
    expect(feedPrices({ net: 205.6452, listNet: 253.3629, vat: 24, onOffer: true })).toEqual({ price: 314.17, sale: 255 });
  });
  it("never turns the permanent SoftOne list price into a sale", () => {
    expect(feedPrices({ net: 205.6452, listNet: 253.3629, vat: 24, onOffer: false })).toEqual({ price: 255, sale: null });
  });
  it("drops the sale when the list price is not higher", () => {
    expect(feedPrices({ net: 100, listNet: 100, vat: 24, onOffer: true })).toEqual({ price: 124, sale: null });
    expect(feedPrices({ net: 100, listNet: null, vat: 24, onOffer: true })).toEqual({ price: 124, sale: null });
  });
});
