import { describe, expect, it } from "vitest";
import { isValidGtin } from "../feeds/google-merchant";

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
