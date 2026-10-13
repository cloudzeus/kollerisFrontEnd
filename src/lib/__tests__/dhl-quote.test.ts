import { beforeEach, describe, expect, it, vi } from "vitest";
import { HdctoolError } from "@/lib/hdctool/client";
import {
  clearDhlQuoteCache,
  etaRange,
  isDhlQuote,
  isQuoteUnavailable,
  isRefused,
  quoteDestination,
} from "@/lib/shipping/courier-quote";

/**
 * Postage per destination (docs/dhl-express.md §1): Greece is ACS exactly as
 * before, the rest of the EU is DHL Express through HDCtool. A 422 about the
 * place is a refusal shown on the Τ.Κ.; a 5xx or a timeout blocks checkout
 * abroad — there is no table for Italy.
 */

const request = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: request,
}));

const ENDPOINT = "/api/public/courier/quote";
const items = [{ quantity: 1, weight: 1.2, width: 10, length: 20, height: 10 }];
const httpError = (status: number, body: unknown) =>
  new HdctoolError(`${ENDPOINT} failed (${status}) ${JSON.stringify(body).slice(0, 200)}`, status, ENDPOINT);

const dhlAnswer = {
  success: true,
  carrier: "DHL",
  productCode: "U",
  productName: "EXPRESS WORLDWIDE EU",
  netAmount: 31.4,
  vatRate: 24,
  grossAmount: 38.94,
  currency: "EUR",
  transitDays: 2,
  source: "dhl-mock",
};

const acsAnswer = {
  success: true,
  quote: {
    stationId: "ΑΘ",
    area: "ΑΘΗΝΑ",
    remote: false,
    basicNet: 2.57,
    extrasNet: 0,
    totalNet: 2.57,
    vatAmount: 0.62,
    totalGross: 3.19,
    weightKg: 1.2,
  },
};

beforeEach(() => {
  request.mockReset();
  clearDhlQuoteCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("quoteDestination", () => {
  it("GR → ACS, with exactly the body it always had (no country field)", async () => {
    request.mockResolvedValue(acsAnswer);
    const quote = await quoteDestination({ country: "GR", postcode: "11526", items });
    expect(quote).toMatchObject({ source: "acs", totalNet: 2.57 });
    expect(request).toHaveBeenCalledWith(ENDPOINT, { postcode: "11526", weightKg: 1.2 });
  });

  it("no country → Greece", async () => {
    request.mockResolvedValue(acsAnswer);
    await quoteDestination({ postcode: "11526", items });
    expect(request).toHaveBeenCalledWith(ENDPOINT, { postcode: "11526", weightKg: 1.2 });
  });

  it("IT → DHL through HDCtool with the country, the normalised postcode and the city", async () => {
    request.mockResolvedValue(dhlAnswer);
    const quote = await quoteDestination({
      country: "IT",
      postcode: "37015",
      city: "Verona",
      items,
      declaredValue: 124,
    });
    expect(isDhlQuote(quote)).toBe(true);
    expect(quote).toMatchObject({
      carrier: "DHL",
      productCode: "U",
      totalNet: 31.4,
      netAmount: 31.4,
      vatRate: 24,
      grossAmount: 38.94,
      etaDays: "2–3",
      origin: "dhl-mock",
      country: "IT",
      postcode: "37015",
    });
    expect(request).toHaveBeenCalledWith(ENDPOINT, {
      country: "IT",
      postcode: "37015",
      city: "Verona",
      weightKg: 1.2,
      declaredValue: 124,
    });
  });

  it("NL sends «1012 AB» however it was typed", async () => {
    request.mockResolvedValue(dhlAnswer);
    await quoteDestination({ country: "NL", postcode: "1012ab", city: "Amsterdam", items });
    expect(request.mock.calls[0][1]).toMatchObject({ country: "NL", postcode: "1012 AB" });
  });

  it.each(["unserviceable_postcode", "unsupported_country", "invalid_postcode"] as const)(
    "422 %s is a refusal with no price",
    async (code) => {
      request.mockRejectedValue(httpError(422, { success: false, error: code, message: "nope" }));
      const quote = await quoteDestination({ country: "IT", postcode: "37015", city: "Verona", items });
      expect(isRefused(quote)).toBe(true);
      expect(quote).toMatchObject({ source: "refused", error: code });
      expect(quote).not.toHaveProperty("totalNet");
    },
  );

  it("400 (missing city / invalid weight) is a form error, not an outage", async () => {
    request.mockRejectedValue(httpError(400, { success: false, error: "city is required" }));
    const quote = await quoteDestination({ country: "IT", postcode: "37015", city: "", items });
    expect(quote).toMatchObject({ source: "refused", error: "invalid_address" });
  });

  it.each([502, 504])("%i (DHL failure / timeout at HDCtool) is unavailable", async (status) => {
    request.mockRejectedValue(httpError(status, { success: false, error: "dhl_error" }));
    const quote = await quoteDestination({ country: "IT", postcode: "37015", city: "Verona", items });
    expect(isQuoteUnavailable(quote)).toBe(true);
  });

  it("a refusal with success:false and status 200 is a refusal too", async () => {
    request.mockResolvedValue({ success: false, error: "unserviceable_postcode", message: "x" });
    const quote = await quoteDestination({ country: "DE", postcode: "10117", city: "Berlin", items });
    expect(quote).toMatchObject({ source: "refused", error: "unserviceable_postcode" });
  });

  it("refuses a postcode of the wrong shape without asking HDCtool", async () => {
    const quote = await quoteDestination({ country: "DE", postcode: "1011", city: "Berlin", items });
    expect(quote).toMatchObject({ source: "refused", error: "invalid_postcode" });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ["a 5xx", () => httpError(502, { error: "DHL down" })],
    ["a timeout", () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })],
    ["a network error", () => new TypeError("fetch failed")],
    ["a 422 that is not about the place", () => httpError(422, { error: "weight_too_high" })],
  ])("%s is «unavailable» — no table abroad", async (_label, make) => {
    request.mockRejectedValue(make());
    const quote = await quoteDestination({ country: "IT", postcode: "37015", city: "Verona", items });
    expect(isQuoteUnavailable(quote)).toBe(true);
    expect(quote).not.toHaveProperty("totalNet");
  });

  it("an answer without a price is unavailable, not free", async () => {
    request.mockResolvedValue({ ...dhlAnswer, netAmount: 0 });
    const quote = await quoteDestination({ country: "IT", postcode: "37015", city: "Verona", items });
    expect(isQuoteUnavailable(quote)).toBe(true);
  });

  it("no postcode yet is pending, not a failure", async () => {
    const quote = await quoteDestination({ country: "IT", postcode: "", items });
    expect(quote).toMatchObject({ source: "unavailable", pending: true });
    expect(request).not.toHaveBeenCalled();
  });

  it("CY → ACS through HDCtool with country CY", async () => {
    request.mockResolvedValue(acsAnswer);
    const quote = await quoteDestination({ country: "CY", postcode: "1010", items });
    expect(quote).toMatchObject({ source: "acs" });
    expect(request).toHaveBeenCalledWith(ENDPOINT, { postcode: "1010", weightKg: 1.2, country: "CY" });
  });

  it("CY with ACS down is unavailable — the table is Greek zones", async () => {
    request.mockRejectedValue(httpError(503, { error: "down" }));
    const quote = await quoteDestination({ country: "CY", postcode: "1010", items });
    expect(isQuoteUnavailable(quote)).toBe(true);
  });

  it("asks HDCtool once for the same parcel and place within ten minutes", async () => {
    request.mockResolvedValue(dhlAnswer);
    await quoteDestination({ country: "IT", postcode: "37015", city: "Verona", items });
    await quoteDestination({ country: "IT", postcode: "37015", city: "Verona", items });
    expect(request).toHaveBeenCalledOnce();
  });
});

describe("etaRange", () => {
  it("is DHL's transit days plus one", () => {
    expect(etaRange(2, null).label).toBe("2–3");
    expect(etaRange(1, null)).toEqual({ min: 1, max: 2, label: "1–2" });
  });

  it("counts working days to DHL's date when there is no transit time", () => {
    // Tuesday 13 → Friday 16 October 2026: three working days.
    expect(etaRange(null, "2026-10-16", new Date("2026-10-13T09:00:00Z")).label).toBe("3–4");
  });

  it("says 2–4 when DHL said nothing", () => {
    expect(etaRange(null, null).label).toBe("2–4");
  });
});
