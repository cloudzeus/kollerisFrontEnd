import { beforeEach, describe, expect, it, vi } from "vitest";
import { HdctoolError } from "@/lib/hdctool/client";
import { clearDhlQuoteCache } from "@/lib/shipping/courier-quote";

/**
 * The basket's postage for a destination abroad (docs/dhl-express.md §4):
 * DHL's price, never free, VAT from `vatRateForDestination`; a refusal or an
 * outage is flagged for the page, with no price.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: request,
}));

const { computeTotals } = await import("@/lib/cart/cart");
const { parseDestination } = await import("@/lib/shipping/destination-cookie");

const lines = [
  { quantity: 2, weight: 1.2, width: 10, length: 20, height: 10, lineNet: 200, lineGross: 248, unitListNet: null, vatRate: 24 },
] as unknown as Parameters<typeof computeTotals>[0];

const dhlAnswer = {
  success: true,
  carrier: "DHL",
  productCode: "U",
  productName: "EXPRESS WORLDWIDE EU",
  netAmount: 31.4,
  currency: "EUR",
  transitDays: 3,
  source: "dhl-mock",
};

beforeEach(() => {
  request.mockReset();
  clearDhlQuoteCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("computeTotals abroad", () => {
  it("prices DHL to Italy, not free over the threshold, 24% VAT", async () => {
    request.mockResolvedValue(dhlAnswer);
    const totals = await computeTotals(lines, "courier", "card", "37015", { country: "IT", city: "Verona" });
    expect(totals.shippingNet).toBe(31.4);
    expect(totals.shippingGross).toBe(38.94);
    expect(totals.totalGross).toBe(286.94);
    expect(totals.postage).toMatchObject({ carrier: "DHL", zoneLabel: "DHL Express", etaDays: "3–4" });
    expect(totals.destination).toEqual({ country: "IT", carrier: "DHL" });
    expect(totals.quoteUnavailable).toBe(false);
  });

  it("flags a DHL refusal with its code and no price", async () => {
    request.mockRejectedValue(
      new HdctoolError('/api/public/courier/quote failed (422) {"error":"invalid_postcode"}', 422, "/x"),
    );
    const totals = await computeTotals(lines, "dhl", "card", "37015", { country: "IT", city: "Verona" });
    expect(totals).toMatchObject({ unserviceable: true, refusal: "invalid_postcode", shippingNet: 0, postage: null });
  });

  it("flags an outage, with no price and no table", async () => {
    request.mockRejectedValue(new HdctoolError("/x failed (504) timeout", 504, "/x"));
    const totals = await computeTotals(lines, "dhl", "card", "37015", { country: "IT" });
    expect(totals).toMatchObject({ quoteUnavailable: true, shippingNet: 0, postage: null });
  });

  it("is pending, not failed, before a postcode is typed", async () => {
    const totals = await computeTotals(lines, "dhl", "card", "", { country: "IT" });
    expect(totals).toMatchObject({ quoteUnavailable: false, quotePending: true });
    expect(request).not.toHaveBeenCalled();
  });

  it("collection from the shop costs nothing anywhere", async () => {
    const totals = await computeTotals(lines, "pickup", "card", "37015", { country: "IT" });
    expect(totals.shippingNet).toBe(0);
    expect(request).not.toHaveBeenCalled();
  });

  it("without a destination is the Greek cart, with no new keys", async () => {
    request.mockResolvedValue({
      success: true,
      quote: { stationId: "Π", area: "", remote: false, basicNet: 3, extrasNet: 0, totalNet: 3, vatAmount: 0.72, totalGross: 3.72, weightKg: 2.4 },
    });
    const totals = await computeTotals(lines, "courier", "card", "18545");
    expect(totals.shippingNet).toBe(0); // over the threshold: free, as always
    expect(totals).not.toHaveProperty("destination");
    expect(request).toHaveBeenCalledWith("/api/public/courier/quote", { postcode: "18545", weightKg: 2.4 });
  });
});

describe("the remembered destination", () => {
  it("reads back a valid destination abroad", () => {
    expect(parseDestination(JSON.stringify({ country: "nl", postcode: "1012ab", city: " Amsterdam " }))).toEqual({
      country: "NL",
      postcode: "1012 AB",
      city: "Amsterdam",
    });
  });

  it("ignores Greece, garbage and countries outside the EU; keeps a country without a valid Τ.Κ.", () => {
    expect(parseDestination(JSON.stringify({ country: "GR", postcode: "18545" }))).toBeNull();
    expect(parseDestination(JSON.stringify({ country: "GB", postcode: "SW1A 1AA" }))).toBeNull();
    expect(parseDestination(JSON.stringify({ country: "IT", postcode: "12" }))).toEqual({
      country: "IT",
      postcode: "",
      city: "",
    });
    expect(parseDestination("{not json")).toBeNull();
    expect(parseDestination(undefined)).toBeNull();
  });
});
