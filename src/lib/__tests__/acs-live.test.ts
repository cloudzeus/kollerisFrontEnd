import { beforeEach, describe, expect, it, vi } from "vitest";
import { HdctoolError } from "@/lib/hdctool/client";
import { isUnserviceable, quoteLivePostage } from "@/lib/shipping/acs-live";

/**
 * The live ACS quote, and when it may fall back to the table.
 *
 * Order KOL-20261013-0002 went to Verona (37015). HDCtool answered 422
 * «No ACS station for postcode 37015» and the shop priced it from the table as
 * a Greek island. "ACS does not deliver there" must never become a price; "ACS
 * is down" still must, or an outage stops every checkout.
 */

const request = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: request,
}));

const ENDPOINT = "/api/public/courier/quote";
const items = [{ quantity: 1, weight: 1.2, width: 10, length: 20, height: 10 }];

/** What `hdctoolRequest` throws for a non-2xx answer — the real class and message. */
const httpError = (status: number, body: unknown) =>
  new HdctoolError(
    `${ENDPOINT} failed (${status}) ${JSON.stringify(body).slice(0, 200)}`,
    status,
    ENDPOINT,
  );

const acsQuote = {
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
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("quoteLivePostage", () => {
  it("prices from ACS when ACS answers", async () => {
    request.mockResolvedValue(acsQuote);
    const quote = await quoteLivePostage({ items, postcode: "11526" });
    expect(quote).toMatchObject({ source: "acs", totalNet: 2.57, station: "ΑΘ" });
    expect(request).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({ postcode: "11526" }));
  });

  it("422 «No ACS station for postcode 37015» is unserviceable — no table price", async () => {
    request.mockRejectedValue(
      httpError(422, { success: false, error: "No ACS station for postcode 37015" }),
    );
    const quote = await quoteLivePostage({ items, postcode: "37015" });
    expect(quote).toEqual({
      source: "unserviceable",
      error: "unserviceable_postcode",
      postcode: "37015",
      reason: "No ACS station for postcode 37015",
    });
    expect(isUnserviceable(quote)).toBe(true);
    expect(quote).not.toHaveProperty("totalNet");
  });

  it("a «no station» answer with success:false and status 200 is unserviceable too", async () => {
    request.mockResolvedValue({ success: false, error: "No ACS station for postcode 37015" });
    expect(isUnserviceable(await quoteLivePostage({ items, postcode: "37015" }))).toBe(true);
  });

  it("404 «Unknown postcode» is unserviceable", async () => {
    request.mockRejectedValue(httpError(404, { success: false, error: "Unknown postcode" }));
    expect(isUnserviceable(await quoteLivePostage({ items, postcode: "37015" }))).toBe(true);
  });

  it("a 5xx falls back to the table, as before", async () => {
    request.mockRejectedValue(httpError(502, { success: false, error: "Courier pricing unavailable" }));
    const quote = await quoteLivePostage({ items, postcode: "84600" });
    expect(quote).toMatchObject({ source: "table", zone: "island" });
    expect(isUnserviceable(quote)).toBe(false);
    if (!isUnserviceable(quote)) expect(quote.totalNet).toBeGreaterThan(0);
  });

  it("a timeout falls back to the table", async () => {
    request.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const quote = await quoteLivePostage({ items, postcode: "54622" });
    expect(quote).toMatchObject({ source: "table" });
  });

  it("HDCtool unreachable falls back to the table", async () => {
    request.mockRejectedValue(new TypeError("fetch failed"));
    expect(await quoteLivePostage({ items, postcode: "54622" })).toMatchObject({ source: "table" });
  });

  it("a 422 that is not about the place («no price row») still falls back", async () => {
    request.mockRejectedValue(httpError(422, { success: false, error: "ACS returned no price row" }));
    expect(await quoteLivePostage({ items, postcode: "54622" })).toMatchObject({ source: "table" });
  });

  it("a 401 that survived the retry falls back — our credentials, not the address", async () => {
    request.mockRejectedValue(httpError(401, { success: false, error: "Unauthorized - API key required" }));
    expect(await quoteLivePostage({ items, postcode: "54622" })).toMatchObject({ source: "table" });
  });

  it("a postcode that cannot be Greek is unserviceable without asking ACS", async () => {
    for (const postcode of ["01067", "90210", "1010", "SW1A 1AA"]) {
      const quote = await quoteLivePostage({ items, postcode });
      expect(quote).toMatchObject({ source: "unserviceable", error: "unserviceable_postcode" });
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("no postcode yet is an estimate from the table, without asking ACS", async () => {
    expect(await quoteLivePostage({ items, postcode: "" })).toMatchObject({
      source: "table",
      fallbackReason: "no postcode yet",
    });
    expect(await quoteLivePostage({ items, postcode: null })).toMatchObject({ source: "table" });
    expect(request).not.toHaveBeenCalled();
  });

  it("sends a spaced postcode to ACS without the space", async () => {
    request.mockResolvedValue(acsQuote);
    await quoteLivePostage({ items, postcode: "162 32" });
    expect(request).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({ postcode: "16232" }));
  });
});
