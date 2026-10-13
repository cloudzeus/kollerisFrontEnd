import { describe, expect, it, vi } from "vitest";

/**
 * The basket's postage for a postcode ACS does not serve: no price, never
 * «ΔΩΡΕΑΝ», and a flag the cart and checkout pages show the customer.
 */

const quote = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/shipping/acs-live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shipping/acs-live")>()),
  quoteLivePostage: quote,
}));

const { computeTotals } = await import("@/lib/cart/cart");

const lines = [
  {
    quantity: 1,
    weight: 1.2,
    width: 10,
    length: 20,
    height: 10,
    lineNet: 100,
    lineGross: 124,
    unitListNet: null,
    vatRate: 24,
  },
] as unknown as Parameters<typeof computeTotals>[0];

describe("computeTotals", () => {
  it("flags an unserviceable postcode and charges no postage for it", async () => {
    quote.mockResolvedValue({
      source: "unserviceable",
      error: "unserviceable_postcode",
      postcode: "37015",
      reason: "No ACS station for postcode 37015",
    });
    const totals = await computeTotals(lines, "courier", "bank", "37015");
    expect(totals.unserviceable).toBe(true);
    expect(totals.postage).toBeNull();
    expect(totals.shippingNet).toBe(0);
  });

  it("prices a table fallback as before", async () => {
    quote.mockResolvedValue({
      zone: "island",
      zoneLabel: "Νησιά",
      etaDays: "2-4",
      chargeableKg: 1.2,
      actualKg: 1.2,
      volumetricKg: 0.4,
      estimated: false,
      baseNet: 4.12,
      extraWeightNet: 0,
      totalNet: 4.12,
      source: "table",
    });
    const totals = await computeTotals(lines, "courier", "bank", "84600");
    expect(totals.unserviceable).toBe(false);
    expect(totals.shippingNet).toBeGreaterThan(0);
  });
});
