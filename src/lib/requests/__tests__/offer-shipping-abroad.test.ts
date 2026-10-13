import { beforeEach, describe, expect, it, vi } from "vitest";
import { HdctoolError } from "@/lib/hdctool/client";
import { clearDhlQuoteCache } from "@/lib/shipping/courier-quote";

/**
 * A back-order request to another EU country (docs/dhl-express.md): when
 * HDCtool's offer leaves `shippingNet` null, the shop prices it with the same
 * DHL quote the checkout uses — never the ACS table, never free.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: request,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findMany: vi.fn(async () => [{ mtrl: 101, weight: 1.2, width: 10, length: 20, height: 10 }]),
    },
  },
}));

const { quoteOfferShipping } = await import("@/lib/requests/shipping");

const ENDPOINT = "/api/public/courier/quote";
const lines = [{ mtrl: 101, qty: 2, unitNet: 100, vatRate: 24 }];
const dhlAnswer = {
  success: true,
  carrier: "DHL",
  productCode: "U",
  productName: "EXPRESS WORLDWIDE EU",
  netAmount: 33.1,
  vatRate: 24,
  grossAmount: 41.04,
  currency: "EUR",
  transitDays: 2,
  source: "dhl-mock",
};

beforeEach(() => {
  request.mockReset();
  clearDhlQuoteCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("quoteOfferShipping abroad", () => {
  const italy = { shippingMethod: "dhl", shipPostcode: "37015", shipCountry: "IT", shipCity: "Verona" };

  it("prices the offered lines with DHL — 200 € net is not free abroad", async () => {
    request.mockResolvedValue(dhlAnswer);
    const quoted = await quoteOfferShipping(italy, lines);
    expect(quoted).toMatchObject({ ok: true, shippingNet: 33.1, dhl: { productCode: "U" } });
    expect(request).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({ country: "IT", postcode: "37015", city: "Verona", weightKg: 2.4 }),
    );
  });

  it("a DHL refusal is unserviceable", async () => {
    request.mockRejectedValue(
      new HdctoolError(`${ENDPOINT} failed (422) {"error":"unserviceable_postcode"}`, 422, ENDPOINT),
    );
    expect(await quoteOfferShipping(italy, lines)).toEqual({ ok: false, reason: "unserviceable" });
  });

  it("DHL down is unavailable — no table", async () => {
    request.mockRejectedValue(new HdctoolError(`${ENDPOINT} failed (500) x`, 500, ENDPOINT));
    expect(await quoteOfferShipping(italy, lines)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("Greece is the ACS quote as before", async () => {
    request.mockResolvedValue({
      success: true,
      quote: { stationId: "Π", area: "", remote: false, basicNet: 3, extrasNet: 0, totalNet: 3, vatAmount: 0.72, totalGross: 3.72, weightKg: 2.4 },
    });
    const quoted = await quoteOfferShipping({ shippingMethod: "courier", shipPostcode: "18545" }, [
      { mtrl: 101, qty: 1, unitNet: 10, vatRate: 24 },
    ]);
    expect(quoted).toEqual({ ok: true, shippingNet: 3 });
    expect(request).toHaveBeenCalledWith(ENDPOINT, { postcode: "18545", weightKg: 1.2 });
  });
});
