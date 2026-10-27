import { describe, expect, it } from "vitest";
import { mayStartVatCheck } from "@/lib/eu-sales/check-gate";

const base = { formatOk: true, checking: false, inFlight: null, asked: "DE123456789", checkedFor: null, answerStatus: null };

describe("mayStartVatCheck", () => {
  it("starts for a fresh, well-formed number", () => {
    expect(mayStartVatCheck(base)).toBe(true);
  });
  it("not for a malformed number, nor while a check is running or asking the same number", () => {
    expect(mayStartVatCheck({ ...base, formatOk: false })).toBe(false);
    expect(mayStartVatCheck({ ...base, checking: true })).toBe(false);
    expect(mayStartVatCheck({ ...base, inFlight: "DE123456789" })).toBe(false);
  });
  it("not again for a number that already has a definite answer, but again after an outage", () => {
    expect(mayStartVatCheck({ ...base, checkedFor: "DE123456789", answerStatus: "invalid" })).toBe(false);
    expect(mayStartVatCheck({ ...base, checkedFor: "DE123456789", answerStatus: "unavailable" })).toBe(true);
  });
  it("a different number is asked even while an older one is remembered", () => {
    expect(mayStartVatCheck({ ...base, checkedFor: "DE999999999", answerStatus: "valid" })).toBe(true);
  });
});
