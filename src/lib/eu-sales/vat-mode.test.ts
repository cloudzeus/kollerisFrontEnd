import { describe, expect, it } from "vitest";
import { athensDay, resolveVatMode } from "@/lib/eu-sales/vat-mode";
import { normaliseEuVat } from "@/lib/eu-sales/vat-format";

/**
 * When an order may drop VAT (intra-EU sales design §3.2–3.3).
 *
 * Exempt needs all four: a country that is not Greece, a company, VIES
 * `valid`, and a check from the same calendar day in Athens. Anything else —
 * Greece, a consumer, an outage, yesterday's answer, another country's answer —
 * is standard VAT.
 */

// 27/10/2026 14:00 in Athens (UTC+2 after the clocks went back on the 25th).
const NOW = new Date("2026-10-27T12:00:00Z");
const TODAY = "2026-10-27T09:15:00Z";
const YESTERDAY = "2026-10-26T20:00:00Z";

describe("resolveVatMode", () => {
  it("GR company with a valid result → standard (Greek companies pay VAT)", () => {
    expect(
      resolveVatMode({ country: "GR", customerType: "company", vies: { status: "valid", checkedAt: TODAY } }, NOW),
    ).toBe("standard");
  });

  it("DE individual, even with a valid result → standard", () => {
    expect(
      resolveVatMode({ country: "DE", customerType: "individual", vies: { status: "valid", checkedAt: TODAY } }, NOW),
    ).toBe("standard");
  });

  it("DE company valid today → exempt", () => {
    expect(
      resolveVatMode({ country: "DE", customerType: "company", vies: { status: "valid", checkedAt: TODAY } }, NOW),
    ).toBe("intra_eu_exempt");
  });

  it("DE company valid yesterday → standard", () => {
    expect(
      resolveVatMode({ country: "DE", customerType: "company", vies: { status: "valid", checkedAt: YESTERDAY } }, NOW),
    ).toBe("standard");
  });

  it("DE company, VIES unavailable → standard", () => {
    expect(
      resolveVatMode({ country: "DE", customerType: "company", vies: { status: "unavailable", checkedAt: TODAY } }, NOW),
    ).toBe("standard");
  });

  it("DE company, no check at all → standard", () => {
    expect(resolveVatMode({ country: "DE", customerType: "company", vies: null }, NOW)).toBe("standard");
  });

  it("DE company, valid but no checkedAt → standard", () => {
    expect(
      resolveVatMode({ country: "DE", customerType: "company", vies: { status: "valid", checkedAt: null } }, NOW),
    ).toBe("standard");
  });

  it("country switched DE → AT with the stale DE result → standard (Review Focus 2)", () => {
    expect(
      resolveVatMode(
        { country: "AT", customerType: "company", vies: { status: "valid", checkedAt: TODAY, country: "DE" } },
        NOW,
      ),
    ).toBe("standard");
  });

  it("Cyprus is not a DHL destination → standard", () => {
    expect(
      resolveVatMode({ country: "CY", customerType: "company", vies: { status: "valid", checkedAt: TODAY } }, NOW),
    ).toBe("standard");
  });

  it("the Athens day, not the UTC day: 23:30 UTC on the 26th is already the 27th in Athens", () => {
    const lateUtc = "2026-10-26T23:30:00Z"; // 01:30 on the 27th in Athens
    expect(athensDay(new Date(lateUtc))).toBe("2026-10-27");
    expect(
      resolveVatMode({ country: "DE", customerType: "company", vies: { status: "valid", checkedAt: lateUtc } }, NOW),
    ).toBe("intra_eu_exempt");
  });
});

describe("normaliseEuVat (Review Focus 1)", () => {
  it.each([
    ["de 123 456 789", "DE"],
    ["DE-123.456.789", "DE"],
    ["DEDE123456789", "DE"],
    ["123456789", "DE"],
  ])("%s → DE123456789", (raw, country) => {
    expect(normaliseEuVat(raw, country)).toEqual({ ok: true, vat: "DE123456789" });
  });

  it("a prefix that differs from the chosen country → invalid_format", () => {
    expect(normaliseEuVat("FR12345678901", "DE")).toEqual({ ok: false, reason: "invalid_format" });
  });

  it("a Greek prefix abroad → invalid_format", () => {
    expect(normaliseEuVat("EL099095556", "DE")).toEqual({ ok: false, reason: "invalid_format" });
  });

  it("Greece is never normalised for VIES", () => {
    expect(normaliseEuVat("el 099095556", "GR")).toEqual({ ok: false, reason: "invalid_format" });
  });

  it("too short or no digits → invalid_format", () => {
    expect(normaliseEuVat("DE12", "DE")).toEqual({ ok: false, reason: "invalid_format" });
    expect(normaliseEuVat("DEABCDEFG", "DE")).toEqual({ ok: false, reason: "invalid_format" });
    expect(normaliseEuVat("", "DE")).toEqual({ ok: false, reason: "invalid_format" });
  });
});
