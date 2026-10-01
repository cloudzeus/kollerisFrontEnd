import { beforeEach, describe, expect, it, vi } from "vitest";

const clearListingCache = vi.fn();
vi.mock("@/lib/catalog/listing-cache", () => ({ clearListingCache }));
vi.mock("@/lib/ai/deepseek", () => ({ chat: vi.fn() }));
vi.mock("@/lib/offers/offer-types", () => ({ validate: () => ({}) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    offer: {
      findUnique: async () => null,
      create: async () => ({ id: "o1" }),
      update: async () => ({ id: "o1" }),
      delete: async () => ({}),
    },
  },
}));

const { saveOffer, deleteOffer } = await import("@/lib/offers/offers");

beforeEach(() => clearListingCache.mockClear());

const draft = {
  slug: "summer", titleEl: "Καλοκαίρι", titleEn: "Summer", titleIt: "Estate",
  descriptionEl: "", descriptionEn: "", descriptionIt: "", badge: "", href: "",
  scope: "brand", productSlugs: [], brandSlug: "milwaukee", categorySlug: "",
  discount: "percent", discountValue: 10, bogoBuy: null, bogoFree: null,
  maxPerCustomer: null, maxTotal: null, widget: "none", image: "", imageWide: "", video: "",
  startsAt: "", endsAt: "", isActive: true,
} as never;

describe("campaign changes and the listing cache", () => {
  // A campaign decides what "Σε προσφορά" and an offer listing contain.
  it("clears it when a campaign is saved", async () => {
    await saveOffer(draft, "admin");
    expect(clearListingCache).toHaveBeenCalledTimes(1);
  });

  it("clears it when a campaign is deleted", async () => {
    await deleteOffer("o1");
    expect(clearListingCache).toHaveBeenCalledTimes(1);
  });
});
