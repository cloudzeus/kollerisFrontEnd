import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDhlQuoteCache } from "@/lib/shipping/courier-quote";

/**
 * `quoteDelivery`, the form's «what does DHL cost» call, with EU sales:
 * open whenever there is a country selector, limited to the countries on
 * offer, and carrying DHL's delivery date for «παράδοση έως …».
 */

const mocks = vi.hoisted(() => ({ request: vi.fn(), getCart: vi.fn(), write: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/shipping/destination-cookie", () => ({ writeDestination: mocks.write }));
vi.mock("@/lib/cart/cart", () => ({ getCart: mocks.getCart }));
vi.mock("@/lib/hdctool/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hdctool/client")>()),
  hdctoolRequest: mocks.request,
}));

const { quoteDelivery } = await import("@/lib/shipping/actions");

beforeEach(() => {
  vi.clearAllMocks();
  clearDhlQuoteCache();
  mocks.getCart.mockResolvedValue({
    lines: [{ quantity: 1, weight: 1.2, width: 10, length: 20, height: 10 }],
    totals: { subtotalGross: 124 },
  });
  mocks.request.mockResolvedValue({
    success: true,
    productCode: "U",
    productName: "EXPRESS WORLDWIDE EU",
    netAmount: 31.4,
    transitDays: 2,
    estimatedDeliveryDate: "2026-10-30T18:00:00",
  });
});

afterEach(() => {
  delete process.env.EU_SALES_ENABLED;
  delete process.env.INTERNATIONAL_SHIPPING_ENABLED;
});

describe("quoteDelivery", () => {
  it("both flags off: disabled, as before", async () => {
    expect(await quoteDelivery({ country: "DE", postcode: "10117" })).toEqual({ status: "disabled" });
  });

  it("EU sales on: Germany is priced, with DHL's delivery day", async () => {
    process.env.EU_SALES_ENABLED = "true";
    expect(await quoteDelivery({ country: "DE", postcode: "10117", city: "Berlin" })).toMatchObject({
      status: "ok",
      carrier: "DHL",
      grossAmount: 38.94,
      deliveryBy: "2026-10-30",
    });
    expect(mocks.write).toHaveBeenCalledWith({ country: "DE", postcode: "10117", city: "Berlin" });
  });

  it("EU sales only: Cyprus is not on offer", async () => {
    process.env.EU_SALES_ENABLED = "true";
    expect(await quoteDelivery({ country: "CY", postcode: "1010" })).toEqual({
      status: "refused",
      code: "unsupported_country",
    });
  });
});
