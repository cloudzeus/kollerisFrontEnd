import { describe, expect, it } from "vitest";
import {
  DHL_COUNTRIES,
  allowedCountries,
  countryOptionsFor,
  isDhlDestination,
  isEuSalesEnabled,
  vatPrefix,
} from "@/lib/eu-sales/countries";

describe("DHL destinations", () => {
  it("are the EU-27 minus Greece and Cyprus: 25 countries", () => {
    expect(DHL_COUNTRIES).toHaveLength(25);
    const codes = DHL_COUNTRIES.map((c) => c.code);
    expect(codes).not.toContain("GR");
    expect(codes).not.toContain("CY");
    expect(codes).toContain("DE");
    expect(codes).toContain("IE");
  });

  it("carry a label in el, en and it", () => {
    const de = DHL_COUNTRIES.find((c) => c.code === "DE")!;
    expect(de.labels).toEqual({ el: "Γερμανία", en: "Germany", it: "Germania" });
    for (const c of DHL_COUNTRIES) {
      expect(c.labels.el && c.labels.en && c.labels.it).toBeTruthy();
    }
  });

  it("isDhlDestination", () => {
    expect(isDhlDestination("de")).toBe(true);
    expect(isDhlDestination("GR")).toBe(false);
    expect(isDhlDestination("CY")).toBe(false);
    expect(isDhlDestination("GB")).toBe(false);
    expect(isDhlDestination(null)).toBe(false);
  });

  it("the VAT prefix of a country (Greece is EL)", () => {
    expect(vatPrefix("DE")).toBe("DE");
    expect(vatPrefix("GR")).toBe("EL");
  });
});

describe("EU_SALES_ENABLED", () => {
  it("is on only for the exact string «true»", () => {
    expect(isEuSalesEnabled({ EU_SALES_ENABLED: "true" })).toBe(true);
    expect(isEuSalesEnabled({ EU_SALES_ENABLED: "on" })).toBe(false);
    expect(isEuSalesEnabled({ EU_SALES_ENABLED: "TRUE" })).toBe(false);
    expect(isEuSalesEnabled({})).toBe(false);
  });
});

describe("allowedCountries", () => {
  it("both flags off: Greece alone", () => {
    expect(allowedCountries({})).toEqual(["GR"]);
  });

  it("EU sales only: Greece and the DHL destinations, no Cyprus", () => {
    const list = allowedCountries({ EU_SALES_ENABLED: "true" });
    expect(list[0]).toBe("GR");
    expect(list).toHaveLength(26);
    expect(list).not.toContain("CY");
  });

  it("international shipping on: today's list, Cyprus included", () => {
    const list = allowedCountries({ INTERNATIONAL_SHIPPING_ENABLED: "on" });
    expect(list).toContain("CY");
    expect(list).toHaveLength(27);
  });
});

describe("countryOptionsFor", () => {
  it("Greece first, the rest by name in the locale", () => {
    const options = countryOptionsFor(["GR", "DE", "AT", "IT"], "el");
    expect(options.map((o) => o.code)).toEqual(["GR", "AT", "DE", "IT"]);
    expect(options[0].name).toBe("Ελλάδα");
  });
});
