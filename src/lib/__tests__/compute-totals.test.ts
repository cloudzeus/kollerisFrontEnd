import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartLineView } from "@/lib/cart/options";

/**
 * The free-shipping threshold in the cart totals comes from the admin setting.
 *
 * `shop.freeShippingNet` sat in the settings screen for months while the
 * storefront read a hardcoded 150 — changing it did nothing. These cases pin
 * the totals to the setting, and pin the fallback for a setting that is unset,
 * nonsense or unreadable.
 */

const settings = vi.hoisted(() => ({ getSettingNumber: vi.fn() }));

vi.mock("@/lib/settings/settings", () => settings);
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/shipping/acs-live", () => ({
  quoteLivePostage: vi.fn(async () => ({
    zoneLabel: "Αττική",
    etaDays: "1",
    chargeableKg: 2,
    estimated: false,
    totalNet: 10,
  })),
}));

const { computeTotals } = await import("@/lib/cart/cart");
const { freeShippingProgress } = await import("@/lib/cart/options");

function line(lineNet: number): CartLineView {
  return {
    id: "l1",
    productId: "p1",
    slug: "tool",
    name: "Tool",
    sku: "T-1",
    brandName: null,
    image: null,
    quantity: 1,
    unitNet: lineNet,
    discountPercent: 0,
    unitNetFinal: lineNet,
    offerTitle: null,
    offerHref: null,
    unitListNet: null,
    vatRate: 24,
    lineNet,
    lineGross: Math.round(lineNet * 124) / 100,
    inStock: true,
    availableQty: 10,
    overStock: false,
    weight: 2,
    width: null,
    length: null,
    height: null,
  };
}

beforeEach(() => {
  settings.getSettingNumber.mockReset();
});

describe("computeTotals — free-shipping threshold", () => {
  it("falls back to 150 when the setting is unset", async () => {
    settings.getSettingNumber.mockResolvedValue(null);

    const below = await computeTotals([line(149)], "courier", "card");
    expect(below.freeShippingThresholdNet).toBe(150);
    expect(below.freeShippingReached).toBe(false);
    expect(below.freeShippingRemaining).toBe(1);
    expect(below.shippingNet).toBe(10);

    const at = await computeTotals([line(150)], "courier", "card");
    expect(at.freeShippingReached).toBe(true);
    expect(at.freeShippingRemaining).toBe(0);
    expect(at.shippingNet).toBe(0);
  });

  it("uses the admin setting when one is saved", async () => {
    settings.getSettingNumber.mockResolvedValue(200);

    const totals = await computeTotals([line(180)], "courier", "card");
    expect(settings.getSettingNumber).toHaveBeenCalledWith("shop.freeShippingNet");
    expect(totals.freeShippingThresholdNet).toBe(200);
    expect(totals.freeShippingReached).toBe(false);
    expect(totals.freeShippingRemaining).toBe(20);
    expect(totals.shippingNet).toBe(10);
    expect(totals.shippingGross).toBe(12.4);
    expect(totals.totalGross).toBe(235.6);
  });

  it("a lower setting makes a basket free that 150 would have charged", async () => {
    settings.getSettingNumber.mockResolvedValue(100);

    const totals = await computeTotals([line(120)], "courier", "card");
    expect(totals.freeShippingReached).toBe(true);
    expect(totals.shippingNet).toBe(0);
    expect(totals.totalGross).toBe(148.8);
  });

  it("honours zero as always free", async () => {
    settings.getSettingNumber.mockResolvedValue(0);

    const totals = await computeTotals([line(5)], "courier", "card");
    expect(totals.freeShippingThresholdNet).toBe(0);
    expect(totals.freeShippingReached).toBe(true);
    expect(totals.shippingNet).toBe(0);
  });

  it("ignores a negative setting", async () => {
    settings.getSettingNumber.mockResolvedValue(-50);

    const totals = await computeTotals([line(5)], "courier", "card");
    expect(totals.freeShippingThresholdNet).toBe(150);
    expect(totals.freeShippingReached).toBe(false);
  });

  it("falls back to 150 when the settings read throws", async () => {
    settings.getSettingNumber.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const totals = await computeTotals([line(149)], "courier", "card");
    expect(totals.freeShippingThresholdNet).toBe(150);
    expect(totals.freeShippingReached).toBe(false);
    spy.mockRestore();
  });

  it("express is never free, whatever the threshold", async () => {
    settings.getSettingNumber.mockResolvedValue(100);

    const totals = await computeTotals([line(500)], "express", "card");
    expect(totals.freeShippingReached).toBe(true);
    expect(totals.shippingNet).toBe(19);
  });
});

describe("freeShippingProgress", () => {
  it("is a capped percentage of the threshold", () => {
    expect(freeShippingProgress(75, 150)).toBe(50);
    expect(freeShippingProgress(300, 150)).toBe(100);
    expect(freeShippingProgress(50, 200)).toBe(25);
  });

  it("does not divide by a zero threshold", () => {
    expect(freeShippingProgress(0, 0)).toBe(100);
  });
});
