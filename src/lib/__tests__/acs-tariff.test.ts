import { describe, expect, it } from "vitest";
import {
  chargeableWeight,
  quotePostage,
  zoneForPostcode,
} from "../shipping/acs-tariff";

describe("zoneForPostcode", () => {
  it("maps Attica postcodes", () => {
    expect(zoneForPostcode("18545")).toBe("attica"); // Piraeus
    expect(zoneForPostcode("11526")).toBe("attica"); // Athens
    expect(zoneForPostcode("190 02")).toBe("attica"); // with a space
  });

  it("maps islands", () => {
    expect(zoneForPostcode("71201")).toBe("island"); // Heraklion
    expect(zoneForPostcode("84600")).toBe("island"); // Mykonos
    expect(zoneForPostcode("49100")).toBe("mainland"); // Corfu town is 49xxx
    expect(zoneForPostcode("28100")).toBe("island"); // Kefalonia
  });

  it("maps the mainland", () => {
    expect(zoneForPostcode("54622")).toBe("mainland"); // Thessaloniki
    expect(zoneForPostcode("26221")).toBe("mainland"); // Patras
  });

  it("falls back to mainland — never to the cheapest zone — on bad input", () => {
    expect(zoneForPostcode(null)).toBe("mainland");
    expect(zoneForPostcode("")).toBe("mainland");
    expect(zoneForPostcode("abc")).toBe("mainland");
    expect(zoneForPostcode("12")).toBe("mainland");
  });
});

describe("chargeableWeight", () => {
  it("sums actual weight across quantities", () => {
    const result = chargeableWeight([
      { quantity: 2, weight: 1.5, width: null, length: null, height: null },
      { quantity: 1, weight: 0.5, width: null, length: null, height: null },
    ]);
    expect(result.actualKg).toBe(3.5);
    expect(result.chargeableKg).toBe(3.5);
    expect(result.estimatedItems).toBe(0);
  });

  it("charges volumetric weight when the parcel is bulky but light", () => {
    // 40×30×25 cm = 30,000 cm³ → 6 kg volumetric, against 1 kg actual.
    const result = chargeableWeight([
      { quantity: 1, weight: 1, width: 40, length: 30, height: 25 },
    ]);
    expect(result.volumetricKg).toBe(6);
    expect(result.chargeableKg).toBe(6);
  });

  it("estimates items with no recorded weight instead of treating them as free", () => {
    const result = chargeableWeight([
      { quantity: 3, weight: null, width: null, length: null, height: null },
    ]);
    expect(result.actualKg).toBeCloseTo(0.9, 5);
    expect(result.estimatedItems).toBe(3);
  });

  it("applies the 0.5 kg minimum", () => {
    const result = chargeableWeight([
      { quantity: 1, weight: 0.05, width: null, length: null, height: null },
    ]);
    expect(result.chargeableKg).toBe(0.5);
  });
});

describe("quotePostage", () => {
  const light = [{ quantity: 1, weight: 1, width: null, length: null, height: null }];

  it("prices a light Attica parcel at the base rate plus fuel", () => {
    const quote = quotePostage({ items: light, postcode: "18545" });
    expect(quote.zone).toBe("attica");
    expect(quote.baseNet).toBe(2.9);
    expect(quote.extraWeightNet).toBe(0);
    expect(quote.fuelSurchargeNet).toBe(0.17); // 2.90 × 6%
    expect(quote.totalNet).toBe(3.07);
  });

  it("charges per extra kilo beyond the base allowance", () => {
    const quote = quotePostage({
      items: [{ quantity: 1, weight: 5, width: null, length: null, height: null }],
      postcode: "54622", // mainland: 3.90 base, 2 kg, 0.95/kg
    });
    expect(quote.chargeableKg).toBe(5);
    expect(quote.extraWeightNet).toBe(2.85); // 3 extra kg
    // 3.90 + 2.85 = 6.75; fuel 6.75 × 6% = 0.405 → 0.41
    expect(quote.fuelSurchargeNet).toBe(0.41);
    expect(quote.totalNet).toBe(7.16);
  });

  it("costs more to an island than to the mainland for the same parcel", () => {
    const mainland = quotePostage({ items: light, postcode: "54622" });
    const island = quotePostage({ items: light, postcode: "84600" });
    expect(island.totalNet).toBeGreaterThan(mainland.totalNet);
  });


  it("flags an estimate when any item lacks a weight", () => {
    expect(quotePostage({ items: light, postcode: "18545" }).estimated).toBe(false);
    expect(
      quotePostage({
        items: [{ quantity: 1, weight: null, width: null, length: null, height: null }],
        postcode: "18545",
      }).estimated,
    ).toBe(true);
  });
});
