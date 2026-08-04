import { describe, expect, it } from "vitest";
import { availabilityFor, clampQuantity } from "../feeds/local-inventory";

/**
 * Google rejects a local-inventory row with a negative quantity outright —
 * and 13 rows in the ERP hold one, an adjustment artefact rather than real
 * stock. These two functions are the whole of what stands between that and
 * every one of those rows silently failing to submit.
 */
describe("clampQuantity", () => {
  it("clamps the ERP's negative-balance artefacts to zero", () => {
    expect(clampQuantity(-3)).toBe(0);
    expect(clampQuantity(-0.5)).toBe(0);
  });

  it("passes real stock through, floored to a whole unit", () => {
    expect(clampQuantity(4)).toBe(4);
    expect(clampQuantity(4.9)).toBe(4);
  });

  it("treats missing stock as zero, not an error", () => {
    expect(clampQuantity(null)).toBe(0);
    expect(clampQuantity(undefined)).toBe(0);
  });

  it("rejects non-finite input rather than emitting NaN into the feed", () => {
    expect(clampQuantity(Number.NaN)).toBe(0);
    expect(clampQuantity(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("availabilityFor", () => {
  it("is in stock only when both the flag and the quantity agree", () => {
    expect(availabilityFor(true, 5)).toBe("in stock");
    expect(availabilityFor(true, 0)).toBe("out of stock");
    expect(availabilityFor(false, 5)).toBe("out of stock");
    expect(availabilityFor(false, 0)).toBe("out of stock");
  });
});
