import { describe, expect, it } from "vitest";
import { isInternationalShippingEnabled } from "@/lib/shipping/flag";
import {
  EU_SHIPPING_COUNTRIES,
  carrierForCountry,
  countryName,
  countryOptions,
  isDhlCountry,
  localityLine,
  normalizeCountry,
  postcodeExample,
  shippingCountries,
  validateCountryPostcode,
} from "@/lib/shipping/countries";
import { normalizePostcode } from "@/lib/shipping/eu-postcodes";
import { vatRateForDestination } from "@/lib/shipping/vat";
import { shippingIntakeBlock } from "@/lib/shipping/intake";
import { shippingMethodsFor, SHIPPING_METHODS } from "@/lib/cart/options";

/**
 * DHL Express to the EU — the pure half (docs/dhl-express.md §4): the flag,
 * the country list, postcodes per country, the one VAT helper and the intake's
 * `shipping` block.
 */

describe("INTERNATIONAL_SHIPPING_ENABLED", () => {
  it("is off unless it says on", () => {
    expect(isInternationalShippingEnabled({})).toBe(false);
    expect(isInternationalShippingEnabled({ INTERNATIONAL_SHIPPING_ENABLED: "" })).toBe(false);
    expect(isInternationalShippingEnabled({ INTERNATIONAL_SHIPPING_ENABLED: "off" })).toBe(false);
    expect(isInternationalShippingEnabled({ INTERNATIONAL_SHIPPING_ENABLED: "false" })).toBe(false);
    for (const on of ["on", "ON", "true", "1", "yes"]) {
      expect(isInternationalShippingEnabled({ INTERNATIONAL_SHIPPING_ENABLED: on })).toBe(true);
    }
  });
});

describe("countries", () => {
  it("is Greece, Cyprus and the other 25 EU member states", () => {
    expect(EU_SHIPPING_COUNTRIES).toHaveLength(27);
    expect(EU_SHIPPING_COUNTRIES.slice(0, 2)).toEqual(["GR", "CY"]);
    expect(new Set(EU_SHIPPING_COUNTRIES).size).toBe(27);
    for (const c of ["IT", "DE", "NL", "MT", "IE", "FR", "ES", "PT", "SE"]) {
      expect(EU_SHIPPING_COUNTRIES).toContain(c);
    }
    for (const c of ["GB", "CH", "NO", "AL", "TR", "US"]) {
      expect(EU_SHIPPING_COUNTRIES).not.toContain(c);
    }
  });

  it("is Greece alone with the flag off", () => {
    expect(shippingCountries(false)).toEqual(["GR"]);
    expect(normalizeCountry("IT", false)).toBeNull();
    expect(normalizeCountry("", false)).toBe("GR");
    expect(normalizeCountry(undefined, true)).toBe("GR");
    expect(normalizeCountry("it", true)).toBe("IT");
    expect(normalizeCountry("GB", true)).toBeNull();
  });

  it("names every country in el, en and it", () => {
    for (const c of EU_SHIPPING_COUNTRIES) {
      for (const locale of ["el", "en", "it"]) {
        expect(countryName(c, locale)).not.toBe(c);
      }
    }
    expect(countryName("IT", "el")).toBe("Ιταλία");
    expect(countryName("DE", "en")).toBe("Germany");
    expect(countryName("NL", "it")).toBe("Paesi Bassi");
  });

  it("lists Greece and Cyprus first, the rest by name in the language", () => {
    const el = countryOptions("el");
    expect(el.map((o) => o.code).slice(0, 2)).toEqual(["GR", "CY"]);
    expect(el).toHaveLength(27);
    const rest = el.slice(2).map((o) => o.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, "el")));
    expect(countryOptions("it")[0].name).toBe("Grecia");
  });

  it("carries GR and CY with ACS, the rest of the EU with DHL", () => {
    expect(carrierForCountry("GR")).toBe("ACS");
    expect(carrierForCountry("CY")).toBe("ACS");
    expect(carrierForCountry("IT")).toBe("DHL");
    expect(carrierForCountry("GB")).toBeNull();
    expect(isDhlCountry("DE")).toBe(true);
    expect(isDhlCountry("GR")).toBe(false);
    expect(isDhlCountry(null)).toBe(false);
  });

  it("offers the methods that fit the country", () => {
    expect(shippingMethodsFor("GR")).toBe(SHIPPING_METHODS);
    expect(shippingMethodsFor("CY").map((m) => m.id)).toEqual(["courier", "pickup"]);
    expect(shippingMethodsFor("IT").map((m) => m.id)).toEqual(["dhl", "pickup"]);
    // The flag-off list never grows.
    expect(SHIPPING_METHODS.map((m) => m.id)).toEqual(["courier", "express", "pickup"]);
  });

  it("names the country on a foreign address only", () => {
    expect(localityLine("18545", "Πειραιάς", "GR")).toBe("18545 Πειραιάς");
    expect(localityLine("37015", "Verona", "IT")).toBe("37015 Verona, Ιταλία");
    expect(localityLine("37015", "Verona", "IT", "en")).toBe("37015 Verona, Italy");
  });
});

describe("postcodes per country", () => {
  it.each([
    ["IT", "37015", "37015"],
    ["DE", "10117", "10117"],
    ["NL", "1012ab", "1012 AB"],
    ["NL", "1012 AB", "1012 AB"],
    ["NL", "1012", "1012"],
    ["PL", "00950", "00-950"],
    ["PT", "1000001", "1000-001"],
    ["SE", "11122", "111 22"],
    ["CZ", "11000", "110 00"],
    ["IE", "d02x285", "D02 X285"],
    ["IE", "D02 X285", "D02 X285"],
    ["MT", "VLT 1117", "VLT 1117"],
    ["MT", "vlt1117", "VLT 1117"],
    ["CY", "1010", "1010"],
    ["GR", "185 45", "18545"],
    ["LV", "LV-1050", "1050"],
  ])("%s %s → %s", (country, raw, expected) => {
    expect(validateCountryPostcode(country, raw)).toEqual({ ok: true, postcode: expected });
  });

  it.each([
    ["IT", "3701"],
    ["DE", "1011"],
    ["NL", "AB 1012"],
    ["IE", "12345"],
    ["MT", "1117"],
    ["MT", ""],
    ["CY", "01010"],
    ["GR", "37015x"],
    ["GR", "90210"],
    ["PT", "1000"],
  ])("refuses %s %s", (country, raw) => {
    expect(validateCountryPostcode(country, raw).ok).toBe(false);
  });

  it("refuses a country outside the list", () => {
    expect(validateCountryPostcode("GB", "SW1A 1AA")).toEqual({ ok: false, reason: "country" });
  });

  it("keeps the skill's data: Malta has no DHL postcode, so HDCtool sends an empty one", () => {
    // The shop asks for the Maltese postcode for the label; DHL's guide does not use it.
    expect(normalizePostcode("MT", "VLT 1117")).toEqual({ ok: true, value: "", known: true });
  });

  it("shows a plausible example per country", () => {
    expect(postcodeExample("GR")).toBe("12345");
    expect(postcodeExample("IT")).toBe("12345");
    expect(postcodeExample("NL")).toBe("1234 AB");
    expect(postcodeExample("PL")).toBe("12-345");
    expect(postcodeExample("MT")).toBe("VLT 1117");
    expect(postcodeExample("IE")).toBe("D02 X285");
    for (const c of EU_SHIPPING_COUNTRIES) {
      expect(validateCountryPostcode(c, postcodeExample(c)).ok).toBe(true);
    }
  });
});

describe("vatRateForDestination", () => {
  it("is Greek 24% for every destination (OSS may change this later)", () => {
    for (const c of [...EU_SHIPPING_COUNTRIES, null, undefined]) {
      expect(vatRateForDestination(c)).toBe(24);
    }
  });
});

describe("the intake's shipping block", () => {
  const dhlQuote = {
    source: "dhl",
    carrier: "DHL",
    productCode: "U",
    netAmount: 31.4,
    quotedAt: "2026-10-13T10:00:00.000Z",
  };

  it("is there for a DHL delivery", () => {
    expect(
      shippingIntakeBlock({
        shipCountry: "IT",
        shippingMethod: "dhl",
        shippingNet: 31.4,
        shippingQuote: dhlQuote,
      }),
    ).toEqual({
      carrier: "DHL",
      productCode: "U",
      netAmount: 31.4,
      vatRate: 24,
      quotedAt: "2026-10-13T10:00:00.000Z",
    });
  });

  it("is absent for Greece, Cyprus and collection", () => {
    const base = { shippingNet: 3.1, shippingQuote: { source: "acs" } };
    expect(shippingIntakeBlock({ ...base, shipCountry: "GR", shippingMethod: "courier" })).toBeNull();
    expect(shippingIntakeBlock({ ...base, shipCountry: "CY", shippingMethod: "courier" })).toBeNull();
    expect(shippingIntakeBlock({ ...base, shipCountry: "IT", shippingMethod: "pickup" })).toBeNull();
  });

  it("says DHL with no product code on a request not priced yet", () => {
    expect(
      shippingIntakeBlock({ shipCountry: "DE", shippingMethod: "dhl", shippingNet: 0, shippingQuote: null }),
    ).toEqual({ carrier: "DHL", productCode: null, netAmount: 0, vatRate: 24, quotedAt: null });
  });
});
