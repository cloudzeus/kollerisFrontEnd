import { describe, expect, it } from "vitest";
import { isValidAfm, normaliseAfm } from "@/lib/account/vat";

/**
 * The ΑΦΜ values below are real, published company numbers (ΟΤΕ, ΕΤΕ, Kolleris
 * itself) — they are what the checkout lookup was verified against.
 */
describe("normaliseAfm", () => {
  it("strips the country prefix, spaces and punctuation", () => {
    expect(normaliseAfm("EL094019245")).toBe("094019245");
    expect(normaliseAfm("el 094019245")).toBe("094019245");
    expect(normaliseAfm("GR094019245")).toBe("094019245");
    expect(normaliseAfm(" 094.019.245 ")).toBe("094019245");
  });

  it("leaves a bare number alone", () => {
    expect(normaliseAfm("099095556")).toBe("099095556");
  });
});

describe("isValidAfm", () => {
  it("accepts real ΑΦΜ", () => {
    expect(isValidAfm("094019245")).toBe(true); // ΟΤΕ
    expect(isValidAfm("094014201")).toBe(true); // ΕΤΕ
    expect(isValidAfm("099095556")).toBe(true); // ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ
  });

  it("accepts an EL-prefixed ΑΦΜ", () => {
    expect(isValidAfm("EL094019245")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    // Same number, last digit off by one — the case a typo actually produces.
    expect(isValidAfm("094019244")).toBe(false);
    expect(isValidAfm("094019246")).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(isValidAfm("09401924")).toBe(false);
    expect(isValidAfm("0940192455")).toBe(false);
    expect(isValidAfm("")).toBe(false);
  });

  it("rejects all zeroes", () => {
    // Passes the modulo arithmetic, is not an ΑΦΜ. This is also the retail
    // placeholder HDCtool uses, so it must never reach the registry.
    expect(isValidAfm("000000000")).toBe(false);
  });

  it("rejects letters", () => {
    expect(isValidAfm("ABCDEFGHI")).toBe(false);
  });
});
